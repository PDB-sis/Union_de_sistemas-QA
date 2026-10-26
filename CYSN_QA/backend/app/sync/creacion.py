"""
Worker de sincronización CREACION (SQL Server -> PostgreSQL).

Reemplaza el workflow n8n "RECOPILACION DE DATOS CREACION SQL SERVER -> POSTGRE SQL".

    SQL Server CREACION --solo lectura--> worker --> __CYSN_SCHEMA__.creacion
                                                    (INSERT / UPDATE / baja lógica)

Uso (desde la carpeta backend):

    python -m app.sync.creacion --verificar-origen   # SELECT 1 + permisos
    python -m app.sync.creacion --dry-run            # lee y compara, no escribe
    python -m app.sync.creacion                      # una sincronización real
    python -m app.sync.creacion --loop               # servicio continuo

Garantías:
- Toda la escritura en __CYSN_SCHEMA__.creacion ocurre en UNA transacción; ante
  cualquier error se revierte y queda la fotografía anterior.
- pg_try_advisory_lock impide que dos workers se solapen.
- Nunca se ejecuta TRUNCATE ni DELETE sobre __CYSN_SCHEMA__.creacion.
- Si la fuente trae 0 filas válidas o las bajas superan
  CYSN_SYNC_MAX_BAJAS_PORCENTAJE, la ejecución se aborta (--forzar para
  omitir este control de forma explícita).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import logging
import signal
import socket
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy import create_engine, text as sqlalchemy_text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from app.sync.config import ConfigSync, cargar_config
from app.sync.normalizacion import (
    COLUMNAS_DESTINO,
    ResultadoNormalizacion,
    normalizar_filas,
)
from app.sync.origen_sqlserver import (
    OrigenNoDisponibleError,
    OrigenNoSeguroError,
    leer_creacion,
)


logger = logging.getLogger("cysn.sync.creacion")


ESQUEMA_DESTINO = os.getenv("CYSN_SYNC_POSTGRES_SCHEMA", "public").strip()

if not re.fullmatch(r"[a-z_][a-z0-9_]*", ESQUEMA_DESTINO):
    raise RuntimeError(
        "CYSN_SYNC_POSTGRES_SCHEMA debe ser un identificador PostgreSQL válido."
    )


def text(sql: str):
    """Construye SQL dirigido al esquema configurado del destino."""
    return sqlalchemy_text(sql.replace("__CYSN_SCHEMA__", ESQUEMA_DESTINO))


PROCESO = "creacion"

# Clave fija del advisory lock de PostgreSQL para este proceso.
LOCK_KEY = 74_201_001

MUESTRA_MAXIMA = 25

EXIT_OK = 0
EXIT_FALLO = 1
EXIT_CONFIGURACION = 2
EXIT_EN_CURSO = 3

LectorOrigen = Callable[[], tuple[list[dict[str, Any]], dict[str, Any]]]


class ConfiguracionError(RuntimeError):
    """Falta configuración o migración; no tiene sentido reintentar."""


class ControlSeguridadError(RuntimeError):
    """La ejecución se detuvo por un control de seguridad de datos."""


@dataclass
class ResumenSync:
    ejecucion_id: int | None = None
    modo: str = "REAL"
    estado: str = "EN_CURSO"
    total_origen: int = 0
    total_validos: int = 0
    descartados: int = 0
    duplicados_origen: int = 0
    insertados: int = 0
    actualizados: int = 0
    sin_cambios: int = 0
    inactivados: int = 0
    hash_completados: int = 0
    vigentes_previos: int = 0
    intentos_origen: int = 0
    duracion_ms: int = 0
    error: str | None = None
    detalle: dict[str, Any] = field(default_factory=dict)


# ============================================================
# Infraestructura
# ============================================================


def crear_engine() -> Engine:
    """
    Engine propio sin pool: al cerrar la conexión se libera
    cualquier advisory lock, incluso si el proceso falla.

    CYSN_SYNC_DATABASE_URL permite dirigir exclusivamente el worker a
    la base unificada sin alterar la conexión de la API.
    """
    from app.db.database import DATABASE_URL

    url_destino = os.getenv("CYSN_SYNC_DATABASE_URL") or str(DATABASE_URL)

    return create_engine(
        url_destino,
        poolclass=NullPool,
        pool_pre_ping=True,
    )


def _json(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False, default=str)


def _columnas(prefijo: str = "") -> str:
    return ", ".join(f"{prefijo}{c}" for c in COLUMNAS_DESTINO)


def _verificar_esquema(conn: Connection, *, dry_run: bool) -> None:
    columnas = set(
        conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = '__CYSN_SCHEMA__'
                  AND table_name = 'creacion'
                """
            )
        ).scalars()
    )

    requeridas = set(COLUMNAS_DESTINO) | {
        "registro_id",
        "hash_origen",
        "sincronizado_en",
        "vigente",
        "ultima_ejecucion_id",
    }
    faltantes = sorted(requeridas - columnas)

    if faltantes:
        raise ConfiguracionError(
            "__CYSN_SCHEMA__.creacion no tiene las columnas de sincronización "
            f"({', '.join(faltantes)}). Aplique migrations/001_creacion_sync_up.sql."
        )

    for tabla in ("sincronizacion_ejecucion", "sincronizacion_estado"):
        existe = conn.execute(
            text("SELECT to_regclass(:t) IS NOT NULL"),
            {"t": f"{ESQUEMA_DESTINO}.{tabla}"},
        ).scalar()

        if not existe:
            raise ConfiguracionError(
                f"No existe __CYSN_SCHEMA__.{tabla}. Aplique migrations/001_creacion_sync_up.sql."
            )

    if dry_run:
        return

    # El modo real exige la migración 002 (índice único + bloqueo de TRUNCATE).
    # Esta migración se aplica en el corte, con n8n detenido.
    indice = conn.execute(
        text("SELECT to_regclass('__CYSN_SCHEMA__.ux_creacion_codigo_barra_vigente') IS NOT NULL")
    ).scalar()

    trigger = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = '__CYSN_SCHEMA__.creacion'::regclass
                  AND tgname = 'creacion_bloquear_truncate'
            )
            """
        )
    ).scalar()

    if not indice or not trigger:
        raise ConfiguracionError(
            "La sincronización real requiere migrations/002_creacion_corte_up.sql "
            "(índice único por código vigente y bloqueo de TRUNCATE). "
            "Aplíquela solo después de detener n8n. Use --dry-run mientras tanto."
        )


def _registrar_inicio(engine: Engine, modo: str) -> int:
    with engine.begin() as log:
        # Con el lock tomado, cualquier ejecución EN_CURSO quedó huérfana
        # (proceso detenido abruptamente).
        log.execute(
            text(
                """
                UPDATE __CYSN_SCHEMA__.sincronizacion_ejecucion
                SET estado = 'ABORTADA',
                    finalizado_en = now(),
                    error = COALESCE(error, 'Proceso interrumpido antes de finalizar.')
                WHERE proceso = :proceso
                  AND estado = 'EN_CURSO'
                """
            ),
            {"proceso": PROCESO},
        )

        return log.execute(
            text(
                """
                INSERT INTO __CYSN_SCHEMA__.sincronizacion_ejecucion
                    (proceso, modo, estado, host)
                VALUES
                    (:proceso, :modo, 'EN_CURSO', :host)
                RETURNING id
                """
            ),
            {"proceso": PROCESO, "modo": modo, "host": socket.gethostname()},
        ).scalar_one()


_SQL_FINALIZAR_EJECUCION = text(
    """
    UPDATE __CYSN_SCHEMA__.sincronizacion_ejecucion
    SET estado = :estado,
        finalizado_en = now(),
        duracion_ms = :duracion_ms,
        total_origen = :total_origen,
        total_validos = :total_validos,
        descartados = :descartados,
        duplicados_origen = :duplicados_origen,
        insertados = :insertados,
        actualizados = :actualizados,
        sin_cambios = :sin_cambios,
        inactivados = :inactivados,
        intentos = :intentos,
        error = :error,
        detalle = CAST(:detalle AS jsonb)
    WHERE id = :id
    """
)

_SQL_ESTADO = text(
    """
    INSERT INTO __CYSN_SCHEMA__.sincronizacion_estado AS E
        (proceso, ultima_ejecucion_id, ultimo_estado, ultimo_modo,
         ultima_ejecucion_en, ultimo_exito_en, ultimo_exito_ejecucion_id,
         ultimo_error, actualizado_en)
    VALUES
        (:proceso, :id, :estado, :modo, now(),
         CASE WHEN :exito THEN now() END,
         CASE WHEN :exito THEN CAST(:id AS bigint) END,
         :error, now())
    ON CONFLICT (proceso) DO UPDATE SET
        ultima_ejecucion_id = EXCLUDED.ultima_ejecucion_id,
        ultimo_estado = EXCLUDED.ultimo_estado,
        ultimo_modo = EXCLUDED.ultimo_modo,
        ultima_ejecucion_en = EXCLUDED.ultima_ejecucion_en,
        ultimo_exito_en = COALESCE(EXCLUDED.ultimo_exito_en, E.ultimo_exito_en),
        ultimo_exito_ejecucion_id = COALESCE(
            EXCLUDED.ultimo_exito_ejecucion_id, E.ultimo_exito_ejecucion_id
        ),
        ultimo_error = EXCLUDED.ultimo_error,
        actualizado_en = now()
    """
)


def _guardar_resultado(conn: Connection, resumen: ResumenSync) -> None:
    conn.execute(
        _SQL_FINALIZAR_EJECUCION,
        {
            "id": resumen.ejecucion_id,
            "estado": resumen.estado,
            "duracion_ms": resumen.duracion_ms,
            "total_origen": resumen.total_origen,
            "total_validos": resumen.total_validos,
            "descartados": resumen.descartados,
            "duplicados_origen": resumen.duplicados_origen,
            "insertados": resumen.insertados,
            "actualizados": resumen.actualizados,
            "sin_cambios": resumen.sin_cambios,
            "inactivados": resumen.inactivados,
            "intentos": resumen.intentos_origen,
            "error": resumen.error,
            "detalle": _json(resumen.detalle),
        },
    )

    conn.execute(
        _SQL_ESTADO,
        {
            "proceso": PROCESO,
            "id": resumen.ejecucion_id,
            "estado": resumen.estado,
            "modo": resumen.modo,
            "exito": resumen.estado == "EXITOSA",
            "error": resumen.error,
        },
    )


def _guardar_resultado_aparte(engine: Engine, resumen: ResumenSync) -> None:
    """Registra el resultado en una conexión independiente (tras un rollback)."""
    try:
        with engine.begin() as log:
            _guardar_resultado(log, resumen)
    except Exception:  # noqa: BLE001 - el registro nunca debe ocultar el error original
        logger.exception("No se pudo registrar el resultado de la ejecución %s", resumen.ejecucion_id)


# ============================================================
# Lectura del origen con reintentos
# ============================================================


def _leer_origen_con_reintentos(
    leer_origen: LectorOrigen,
    config: ConfigSync,
    resumen: ResumenSync,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    intentos_max = max(1, config.reintentos)

    for intento in range(1, intentos_max + 1):
        resumen.intentos_origen = intento

        try:
            return leer_origen()
        except OrigenNoDisponibleError as exc:
            if intento >= intentos_max:
                raise

            espera = config.espera_reintento_segundos * intento
            logger.warning(
                "SQL Server no disponible (intento %s/%s): %s. Reintentando en %ss.",
                intento,
                intentos_max,
                exc,
                espera,
            )
            time.sleep(espera)

    raise AssertionError("inalcanzable")


# ============================================================
# Carga en staging y aplicación de diferencias
# ============================================================


def _cargar_staging(conn: Connection, filas: list[dict[str, Any]]) -> None:
    # La tabla temporal copia los tipos exactos de __CYSN_SCHEMA__.creacion, por lo que
    # las conversiones son las mismas que hacía el INSERT de n8n.
    conn.execute(
        text(
            f"""
            CREATE TEMP TABLE stg_creacion ON COMMIT DROP AS
            SELECT {_columnas()}, hash_origen
            FROM __CYSN_SCHEMA__.creacion
            WITH NO DATA
            """
        )
    )

    columnas = list(COLUMNAS_DESTINO) + ["hash_origen"]
    raw = conn.connection.driver_connection
    cursor = raw.cursor()

    try:
        if hasattr(cursor, "copy"):
            # psycopg 3: COPY es la vía más rápida y segura (sin SQL armado a mano).
            with cursor.copy(
                f"COPY stg_creacion ({', '.join(columnas)}) FROM STDIN"
            ) as copia:
                for fila in filas:
                    copia.write_row([fila[c] for c in columnas])
        else:
            marcadores = ", ".join(["%s"] * len(columnas))
            cursor.executemany(
                f"INSERT INTO stg_creacion ({', '.join(columnas)}) VALUES ({marcadores})",
                [[fila[c] for c in columnas] for fila in filas],
            )
    finally:
        cursor.close()

    conn.execute(text("CREATE INDEX ON stg_creacion (codigo_barra)"))
    conn.execute(text("ANALYZE stg_creacion"))


def _expr_cambio() -> str:
    return f"({_columnas('C.')}) IS DISTINCT FROM ({_columnas('S.')})"


def _calcular_diferencias(conn: Connection) -> dict[str, Any]:
    conteo = conn.execute(
        text(
            f"""
            SELECT
                (SELECT count(*) FROM __CYSN_SCHEMA__.creacion WHERE vigente) AS vigentes,

                (SELECT count(*) FROM stg_creacion S
                 WHERE NOT EXISTS (
                     SELECT 1 FROM __CYSN_SCHEMA__.creacion C
                     WHERE C.vigente AND C.codigo_barra = S.codigo_barra
                 )) AS nuevos,

                -- Por código: antes de la migración 002 un código puede tener
                -- varias filas vigentes (duplicados de n8n).
                (SELECT count(DISTINCT S.codigo_barra) FROM stg_creacion S
                 JOIN __CYSN_SCHEMA__.creacion C
                   ON C.vigente AND C.codigo_barra = S.codigo_barra
                 WHERE {_expr_cambio()}) AS cambiados,

                (SELECT count(*) FROM __CYSN_SCHEMA__.creacion C
                 WHERE C.vigente
                   AND NOT EXISTS (
                       SELECT 1 FROM stg_creacion S
                       WHERE S.codigo_barra = C.codigo_barra
                   )) AS bajas
            """
        )
    ).mappings().one()

    return dict(conteo)


def _muestras(conn: Connection) -> dict[str, list[str]]:
    params = {"n": MUESTRA_MAXIMA}

    nuevos = conn.execute(
        text(
            """
            SELECT S.codigo_barra FROM stg_creacion S
            WHERE NOT EXISTS (
                SELECT 1 FROM __CYSN_SCHEMA__.creacion C
                WHERE C.vigente AND C.codigo_barra = S.codigo_barra
            )
            ORDER BY S.codigo_barra LIMIT :n
            """
        ),
        params,
    ).scalars().all()

    cambiados = conn.execute(
        text(
            f"""
            SELECT DISTINCT S.codigo_barra FROM stg_creacion S
            JOIN __CYSN_SCHEMA__.creacion C ON C.vigente AND C.codigo_barra = S.codigo_barra
            WHERE {_expr_cambio()}
            ORDER BY S.codigo_barra LIMIT :n
            """
        ),
        params,
    ).scalars().all()

    bajas = conn.execute(
        text(
            """
            SELECT C.codigo_barra FROM __CYSN_SCHEMA__.creacion C
            WHERE C.vigente AND NOT EXISTS (
                SELECT 1 FROM stg_creacion S WHERE S.codigo_barra = C.codigo_barra
            )
            ORDER BY C.codigo_barra NULLS FIRST LIMIT :n
            """
        ),
        params,
    ).scalars().all()

    return {
        "muestra_nuevos": list(nuevos),
        "muestra_cambiados": list(cambiados),
        "muestra_bajas": [c if c is not None else "<NULL>" for c in bajas],
    }


def _aplicar_diferencias(conn: Connection, ejecucion_id: int) -> dict[str, int]:
    asignaciones = ",\n".join(f"{c} = S.{c}" for c in COLUMNAS_DESTINO)
    params = {"ejecucion_id": ejecucion_id}

    # Marcar en staging qué códigos cambiaron antes de actualizar, para
    # distinguir cambios reales de la simple carga de hash_origen.
    conn.execute(text("ALTER TABLE stg_creacion ADD COLUMN cambio boolean NOT NULL DEFAULT false"))
    conn.execute(
        text(
            f"""
            UPDATE stg_creacion AS S
            SET cambio = true
            FROM __CYSN_SCHEMA__.creacion AS C
            WHERE C.vigente
              AND C.codigo_barra = S.codigo_barra
              AND {_expr_cambio()}
            """
        )
    )

    # UPDATE: códigos vigentes cuyos campos cambiaron. También completa
    # hash_origen en filas cargadas por n8n (sin contarlas como actualizadas).
    filas_update = conn.execute(
        text(
            f"""
            UPDATE __CYSN_SCHEMA__.creacion AS C
            SET {asignaciones},
                hash_origen = S.hash_origen,
                sincronizado_en = now(),
                ultima_ejecucion_id = :ejecucion_id
            FROM stg_creacion AS S
            WHERE C.vigente
              AND C.codigo_barra = S.codigo_barra
              AND (
                  S.cambio
                  OR C.hash_origen IS DISTINCT FROM S.hash_origen
              )
            RETURNING S.cambio
            """
        ),
        params,
    ).scalars().all()

    actualizados = sum(1 for cambio in filas_update if cambio)
    hash_completados = len(filas_update) - actualizados

    # INSERT: códigos sin fila vigente (nuevos o que reaparecen).
    insertados = conn.execute(
        text(
            f"""
            INSERT INTO __CYSN_SCHEMA__.creacion
                ({_columnas()}, hash_origen, vigente, sincronizado_en, ultima_ejecucion_id)
            SELECT {_columnas('S.')}, S.hash_origen, true, now(), :ejecucion_id
            FROM stg_creacion AS S
            WHERE NOT EXISTS (
                SELECT 1 FROM __CYSN_SCHEMA__.creacion C
                WHERE C.vigente AND C.codigo_barra = S.codigo_barra
            )
            """
        ),
        params,
    ).rowcount

    # Baja lógica: vigentes que ya no llegan desde el origen.
    inactivados = conn.execute(
        text(
            """
            UPDATE __CYSN_SCHEMA__.creacion AS C
            SET vigente = false,
                sincronizado_en = now(),
                ultima_ejecucion_id = :ejecucion_id
            WHERE C.vigente
              AND NOT EXISTS (
                  SELECT 1 FROM stg_creacion S
                  WHERE S.codigo_barra = C.codigo_barra
              )
            """
        ),
        params,
    ).rowcount

    return {
        "insertados": insertados,
        "actualizados": actualizados,
        "hash_completados": hash_completados,
        "inactivados": inactivados,
    }


def _validar_controles(
    resumen: ResumenSync,
    normalizado: ResultadoNormalizacion,
    diferencias: dict[str, Any],
    config: ConfigSync,
    forzar: bool,
) -> None:
    if normalizado.total_origen == 0:
        raise ControlSeguridadError(
            "SQL Server devolvió 0 filas (¿falta TASA_CAMBIO o PARAMETROS?). "
            "No se modificó __CYSN_SCHEMA__.creacion."
        )

    if len(normalizado.filas) < config.min_filas_validas:
        raise ControlSeguridadError(
            f"Solo {len(normalizado.filas)} filas válidas (mínimo "
            f"{config.min_filas_validas}). No se modificó __CYSN_SCHEMA__.creacion."
        )

    vigentes = int(diferencias["vigentes"])
    bajas = int(diferencias["bajas"])

    if forzar or vigentes == 0 or bajas == 0:
        return

    porcentaje = Decimal(bajas * 100) / Decimal(vigentes)

    if porcentaje > config.max_bajas_porcentaje:
        raise ControlSeguridadError(
            f"Se darían de baja {bajas} de {vigentes} códigos vigentes "
            f"({porcentaje:.2f}% > {config.max_bajas_porcentaje}%). "
            "Revise el origen; si es correcto, ejecute una vez con --forzar."
        )


# ============================================================
# Ejecución
# ============================================================


def ejecutar_sincronizacion(
    *,
    dry_run: bool = False,
    forzar: bool = False,
    config: ConfigSync | None = None,
    engine: Engine | None = None,
    leer_origen: LectorOrigen | None = None,
) -> ResumenSync:
    config = config or cargar_config()
    engine = engine or crear_engine()

    if leer_origen is None:
        if not config.sqlserver.enabled:
            raise ConfiguracionError(
                "CYSN_SQLSERVER_ENABLED=false: la sincronización está deshabilitada."
            )

        def leer_origen() -> tuple[list[dict[str, Any]], dict[str, Any]]:
            return leer_creacion(config.sqlserver)

    resumen = ResumenSync(modo="DRY_RUN" if dry_run else "REAL")
    inicio = time.monotonic()

    with engine.connect() as conn:
        bloqueado = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"),
            {"k": LOCK_KEY},
        ).scalar()
        conn.commit()

        if not bloqueado:
            resumen.estado = "OMITIDA"
            resumen.error = "Otra sincronización está en curso."
            logger.info(resumen.error)
            return resumen

        try:
            _verificar_esquema(conn, dry_run=dry_run)
            conn.commit()

            resumen.ejecucion_id = _registrar_inicio(engine, resumen.modo)
            logger.info(
                "Ejecución %s iniciada (modo %s).",
                resumen.ejecucion_id,
                resumen.modo,
            )

            try:
                filas_origen, permisos = _leer_origen_con_reintentos(
                    leer_origen, config, resumen
                )
                resumen.detalle["permisos_origen"] = permisos

                normalizado = normalizar_filas(filas_origen)
                resumen.total_origen = normalizado.total_origen
                resumen.total_validos = len(normalizado.filas)
                resumen.descartados = normalizado.descartados_codigo_invalido
                resumen.duplicados_origen = normalizado.duplicados_origen
                resumen.detalle["muestra_duplicados_origen"] = (
                    normalizado.codigos_duplicados[:MUESTRA_MAXIMA]
                )

                # ---------- Transacción única en PostgreSQL ----------
                conn.execute(text("SET LOCAL lock_timeout = '30s'"))

                _cargar_staging(conn, normalizado.filas)
                diferencias = _calcular_diferencias(conn)
                resumen.vigentes_previos = int(diferencias["vigentes"])
                resumen.detalle.update(_muestras(conn))

                _validar_controles(resumen, normalizado, diferencias, config, forzar)

                if dry_run:
                    resumen.insertados = int(diferencias["nuevos"])
                    resumen.actualizados = int(diferencias["cambiados"])
                    resumen.inactivados = int(diferencias["bajas"])
                    resumen.sin_cambios = (
                        resumen.total_validos - resumen.insertados - resumen.actualizados
                    )
                    conn.rollback()
                    resumen.estado = "EXITOSA"
                    resumen.duracion_ms = int((time.monotonic() - inicio) * 1000)
                    _guardar_resultado_aparte(engine, resumen)
                else:
                    aplicado = _aplicar_diferencias(conn, resumen.ejecucion_id)
                    resumen.insertados = aplicado["insertados"]
                    resumen.actualizados = aplicado["actualizados"]
                    resumen.hash_completados = aplicado["hash_completados"]
                    resumen.inactivados = aplicado["inactivados"]
                    resumen.sin_cambios = (
                        resumen.total_validos - resumen.insertados - resumen.actualizados
                    )
                    resumen.detalle["hash_completados"] = resumen.hash_completados

                    resumen.estado = "EXITOSA"
                    resumen.duracion_ms = int((time.monotonic() - inicio) * 1000)

                    # El registro de éxito se confirma junto con los datos.
                    _guardar_resultado(conn, resumen)
                    conn.commit()

            except Exception as exc:
                conn.rollback()
                resumen.estado = "FALLIDA"
                resumen.error = f"{type(exc).__name__}: {exc}"
                resumen.duracion_ms = int((time.monotonic() - inicio) * 1000)
                _guardar_resultado_aparte(engine, resumen)
                raise

        finally:
            try:
                conn.rollback()
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
                conn.commit()
            except Exception:  # noqa: BLE001 - al cerrar la conexión se libera igual
                logger.debug("No se pudo liberar el lock explícitamente.", exc_info=True)

    logger.info(
        "Ejecución %s %s (%s): origen=%s válidos=%s descartados=%s duplicados=%s "
        "insertados=%s actualizados=%s sin_cambios=%s inactivados=%s duración=%sms",
        resumen.ejecucion_id,
        resumen.estado,
        resumen.modo,
        resumen.total_origen,
        resumen.total_validos,
        resumen.descartados,
        resumen.duplicados_origen,
        resumen.insertados,
        resumen.actualizados,
        resumen.sin_cambios,
        resumen.inactivados,
        resumen.duracion_ms,
    )

    return resumen


def ejecutar_ciclo(*, dry_run: bool, forzar: bool) -> int:
    """Una ejecución con manejo de errores y código de salida."""
    try:
        resumen = ejecutar_sincronizacion(dry_run=dry_run, forzar=forzar)
    except (ConfiguracionError, OrigenNoSeguroError) as exc:
        logger.error("%s", exc)
        return EXIT_CONFIGURACION
    except ControlSeguridadError as exc:
        logger.error("Control de seguridad: %s", exc)
        return EXIT_FALLO
    except (OrigenNoDisponibleError, OperationalError) as exc:
        logger.error("Error transitorio, se reintentará en el siguiente ciclo: %s", exc)
        return EXIT_FALLO
    except Exception:  # noqa: BLE001
        logger.exception("Error inesperado en la sincronización.")
        return EXIT_FALLO

    if resumen.estado == "OMITIDA":
        return EXIT_EN_CURSO

    if dry_run:
        print(json.dumps(asdict(resumen), ensure_ascii=False, indent=2, default=str))

    return EXIT_OK


def ejecutar_loop(*, intervalo: int, dry_run: bool) -> int:
    detener = threading.Event()

    def _senal(signum, _frame):
        logger.info("Señal %s recibida; finalizando tras el ciclo actual.", signum)
        detener.set()

    signal.signal(signal.SIGINT, _senal)
    signal.signal(signal.SIGTERM, _senal)

    logger.info("Worker CREACION iniciado (intervalo %ss, dry_run=%s).", intervalo, dry_run)

    while not detener.is_set():
        ejecutar_ciclo(dry_run=dry_run, forzar=False)
        detener.wait(intervalo)

    logger.info("Worker CREACION detenido.")
    return EXIT_OK


def verificar_origen() -> int:
    from app.sync.origen_sqlserver import conectar, verificar_solo_lectura

    config = cargar_config()

    try:
        with conectar(config.sqlserver) as conexion:
            detalle = verificar_solo_lectura(conexion)
    except Exception as exc:  # noqa: BLE001
        logger.error("Verificación de SQL Server fallida: %s", exc)
        return EXIT_FALLO

    print(json.dumps(detalle, ensure_ascii=False, indent=2))

    if detalle["permisos_escritura"] or detalle.get("sin_select"):
        logger.error(
            "El usuario NO cumple el perfil de solo lectura requerido. "
            "Solicite al DBA ajustar los permisos de cysn_sync."
        )
        return EXIT_CONFIGURACION

    logger.info("SELECT 1 correcto y el usuario no tiene permisos de escritura.")
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.sync.creacion",
        description="Sincroniza SQL Server CREACION hacia __CYSN_SCHEMA__.creacion.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Lee y compara; no escribe en __CYSN_SCHEMA__.creacion.")
    parser.add_argument("--loop", action="store_true", help="Ejecuta continuamente cada --intervalo segundos.")
    parser.add_argument("--intervalo", type=int, default=None, help="Segundos entre ciclos (por defecto CYSN_SYNC_INTERVALO_SEGUNDOS).")
    parser.add_argument("--forzar", action="store_true", help="Omite el límite de bajas masivas (una sola ejecución).")
    parser.add_argument("--verificar-origen", action="store_true", help="Solo prueba SELECT 1 y permisos en SQL Server.")
    parser.add_argument("-v", "--verbose", action="store_true")

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.verificar_origen:
        return verificar_origen()

    if args.loop:
        if args.forzar:
            parser.error("--forzar no se permite con --loop.")

        intervalo = args.intervalo or cargar_config().intervalo_segundos
        return ejecutar_loop(intervalo=max(30, intervalo), dry_run=args.dry_run)

    return ejecutar_ciclo(dry_run=args.dry_run, forzar=args.forzar)


if __name__ == "__main__":
    sys.exit(main())
