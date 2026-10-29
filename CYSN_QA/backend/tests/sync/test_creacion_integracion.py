"""
Pruebas de integración del worker CREACION contra PostgreSQL real.

Requieren una base de datos DESCARTABLE cuyo nombre contenga "test":

    set CYSN_TEST_DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/cysn_qa_test
    python -m pytest tests/sync -q

Las pruebas recrean public.creacion y las tablas de sincronización en esa
base. Nunca deben apuntar a la base de datos de operación.
"""

from __future__ import annotations

import os
import threading
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.pool import NullPool

from app.sync import creacion as worker
from app.sync.config import ConfigSqlServer, ConfigSync
from app.sync.origen_sqlserver import OrigenNoDisponibleError


URL = os.getenv("CYSN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not URL, reason="CYSN_TEST_DATABASE_URL no configurada"
)

MIGRACIONES = Path(__file__).resolve().parents[2] / "migrations"

# Estructura equivalente a la tabla que alimentaba n8n.
DDL_CREACION = """
CREATE TABLE public.creacion (
    registro_id                BIGSERIAL PRIMARY KEY,
    sucursal_origen            VARCHAR(150),
    tasa_cambio                NUMERIC(18, 4),
    fecha_tasa_cambio          TIMESTAMP,
    codigo_barra               VARCHAR(100),
    referencia                 VARCHAR(150),
    codigo_marca_origen        VARCHAR(50),
    concatenado                VARCHAR(200),
    marca_origen               VARCHAR(150),
    descripcion                TEXT,
    codigo_categoria           VARCHAR(50),
    nombre_categoria           VARCHAR(150),
    status_origen              VARCHAR(20),
    existencia                 NUMERIC(18, 4),
    costo_dolar                NUMERIC(18, 4),
    costo_inicial              NUMERIC(18, 4),
    precio_promocion           NUMERIC(18, 4),
    precio_detal_usd_mas_iva   NUMERIC(18, 2),
    precio_detal_mas_iva       NUMERIC(18, 2),
    precio_mayor_usd_mas_iva   NUMERIC(18, 2),
    precio_mayor_mas_iva       NUMERIC(18, 2)
)
"""

INSERT_N8N = """
INSERT INTO public.creacion (sucursal_origen, tasa_cambio, fecha_tasa_cambio,
    codigo_barra, referencia, codigo_marca_origen, concatenado, marca_origen,
    descripcion, codigo_categoria, nombre_categoria, status_origen, existencia,
    costo_dolar, costo_inicial, precio_promocion, precio_detal_usd_mas_iva,
    precio_detal_mas_iva, precio_mayor_usd_mas_iva, precio_mayor_mas_iva)
VALUES ('SUCURSAL CENTRO', 36.5, '2026-10-08 08:00:00'::timestamp,
    :codigo, 'REF', '12', 'REF12', 'MARCA', 'PRODUCTO', '3', 'CAT', 'true',
    :existencia, 1.25, 45.625, NULL, :precio, 84.68, 2.10, 76.56)
"""


def _origen(codigo: str, **cambios):
    fila = {
        "TasaCambio": Decimal("36.5000"),
        "FECHA_TASA_CAMBIO": "2026-10-08 08:00:00",
        "SUCURSAL": "SUCURSAL CENTRO",
        "CodigoBarra": codigo,
        "Referencia": "REF",
        "CodigoMarcaOrigen": 12,
        "Concatenado": "REF12",
        "Marca": "MARCA",
        "Descripcion": "PRODUCTO",
        "CodigoCategoria": 3,
        "NombreCategoria": "CAT",
        "Status": True,
        "Existencia": Decimal("10"),
        "CostoDolar": Decimal("1.25"),
        "CostoInicial": Decimal("45.625"),
        "PrecioPromocion": None,
        "PrecioDetalUSDMasIVA": Decimal("2.32"),
        "PrecioDetalMasIVA": Decimal("84.68"),
        "PrecioMayorUSDMasIVA": Decimal("2.10"),
        "PrecioMayorMasIVA": Decimal("76.56"),
    }
    fila.update(cambios)
    return fila


def _lector(filas):
    return lambda: (list(filas), {"select_1": True, "permisos_escritura": []})


CONFIG = ConfigSync(
    sqlserver=ConfigSqlServer(
        enabled=True, host=None, instance=None, port=None, database="CREACION",
        user=None, password=None, driver="", encrypt=True,
        trust_server_certificate=False, login_timeout=1, query_timeout=1,
        require_readonly=True,
    ),
    intervalo_segundos=60,
    reintentos=3,
    espera_reintento_segundos=0,
    max_bajas_porcentaje=Decimal("50"),
    min_filas_validas=1,
)


@pytest.fixture(scope="module")
def engine():
    url = make_url(URL)
    assert url.database and "test" in url.database.lower(), (
        "Por seguridad, CYSN_TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga 'test'."
    )
    eng = create_engine(url, poolclass=NullPool)
    yield eng
    eng.dispose()


def _ejecutar_sql(engine, ruta: Path):
    with engine.begin() as conn:
        conn.exec_driver_sql(ruta.read_text(encoding="utf-8").replace("BEGIN;", "").replace("COMMIT;", ""))


@pytest.fixture()
def db(engine):
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "DROP TABLE IF EXISTS public.creacion, public.creacion_corte_002, "
            "public.sincronizacion_ejecucion, public.sincronizacion_estado CASCADE"
        )
        conn.exec_driver_sql("DROP FUNCTION IF EXISTS public.creacion_bloquear_truncate() CASCADE")
        conn.exec_driver_sql(DDL_CREACION)

    _ejecutar_sql(engine, MIGRACIONES / "001_creacion_sync_up.sql")
    _ejecutar_sql(engine, MIGRACIONES / "002_creacion_corte_up.sql")
    return engine


def _sync(engine, filas, **kwargs):
    kwargs.setdefault("config", CONFIG)
    return worker.ejecutar_sincronizacion(
        engine=engine, leer_origen=_lector(filas), **kwargs
    )


def _vigentes(engine):
    with engine.connect() as conn:
        return {
            r.codigo_barra: r
            for r in conn.execute(
                text("SELECT * FROM public.creacion WHERE vigente ORDER BY codigo_barra")
            )
        }


def _todas(engine):
    with engine.connect() as conn:
        return conn.execute(text("SELECT * FROM public.creacion ORDER BY registro_id")).all()


def _ejecuciones(engine):
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT * FROM public.sincronizacion_ejecucion ORDER BY id")
        ).all()


BASE = [_origen("111111111"), _origen("222222222"), _origen("333333333")]


# ------------------------------------------------------------
# Escenarios funcionales
# ------------------------------------------------------------


def test_carga_inicial_inserta_todo(db):
    r = _sync(db, BASE)
    assert (r.estado, r.insertados, r.actualizados, r.inactivados) == ("EXITOSA", 3, 0, 0)
    vig = _vigentes(db)
    assert set(vig) == {"111111111", "222222222", "333333333"}
    assert vig["111111111"].precio_detal_usd_mas_iva == Decimal("2.32")
    assert vig["111111111"].status_origen == "true"
    assert vig["111111111"].hash_origen is not None


def test_sin_cambios_no_escribe(db):
    _sync(db, BASE)
    antes = _todas(db)
    r = _sync(db, BASE)
    assert (r.insertados, r.actualizados, r.inactivados, r.sin_cambios) == (0, 0, 0, 3)
    assert _todas(db) == antes


def test_codigo_nuevo(db):
    _sync(db, BASE)
    r = _sync(db, BASE + [_origen("444444444")])
    assert (r.insertados, r.actualizados, r.inactivados) == (1, 0, 0)
    assert "444444444" in _vigentes(db)


def test_cambio_de_precio_actualiza_misma_fila(db):
    _sync(db, BASE)
    id_antes = _vigentes(db)["222222222"].registro_id
    r = _sync(db, [BASE[0], _origen("222222222", PrecioDetalUSDMasIVA=Decimal("2.50")), BASE[2]])
    assert (r.insertados, r.actualizados, r.inactivados) == (0, 1, 0)
    fila = _vigentes(db)["222222222"]
    assert fila.precio_detal_usd_mas_iva == Decimal("2.50")
    assert fila.registro_id == id_antes
    assert fila.ultima_ejecucion_id == r.ejecucion_id


def test_cambio_de_tasa_actualiza_todos(db):
    _sync(db, BASE)
    nuevos = [_origen(f["CodigoBarra"], TasaCambio=Decimal("37.1000")) for f in BASE]
    r = _sync(db, nuevos)
    assert r.actualizados == 3
    assert all(f.tasa_cambio == Decimal("37.1") for f in _vigentes(db).values())


def test_codigo_invalido_se_descarta_y_cuenta(db):
    r = _sync(db, BASE + [_origen("ABC123456"), _origen("1234")])
    assert r.descartados == 2
    assert r.total_origen == 5 and r.total_validos == 3
    assert len(_vigentes(db)) == 3


def test_producto_que_desaparece_queda_inactivo_sin_borrarse(db):
    _sync(db, BASE + [_origen("444444444")])
    r = _sync(db, BASE)
    assert r.inactivados == 1
    assert "444444444" not in _vigentes(db)
    assert any(f.codigo_barra == "444444444" and not f.vigente for f in _todas(db))


def test_producto_que_reaparece_crea_fila_vigente_nueva(db):
    _sync(db, BASE + [_origen("444444444")])
    _sync(db, BASE)
    r = _sync(db, BASE + [_origen("444444444")])
    assert r.insertados == 1
    filas = [f for f in _todas(db) if f.codigo_barra == "444444444"]
    assert [f.vigente for f in filas] == [False, True]


def test_duplicados_en_origen_conserva_la_ultima(db):
    r = _sync(db, BASE + [_origen("111111111", Existencia=Decimal("99"))])
    assert r.duplicados_origen == 1
    assert _vigentes(db)["111111111"].existencia == Decimal("99")


# ------------------------------------------------------------
# Compatibilidad con datos cargados por n8n
# ------------------------------------------------------------


def test_primera_ejecucion_sobre_datos_de_n8n_no_cuenta_cambios(engine):
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "DROP TABLE IF EXISTS public.creacion, public.creacion_corte_002, "
            "public.sincronizacion_ejecucion, public.sincronizacion_estado CASCADE"
        )
        conn.exec_driver_sql("DROP FUNCTION IF EXISTS public.creacion_bloquear_truncate() CASCADE")
        conn.exec_driver_sql(DDL_CREACION)
        for codigo in ("111111111", "222222222", "333333333"):
            conn.execute(text(INSERT_N8N), {"codigo": codigo, "existencia": 10, "precio": 2.32})
        # Duplicado típico de n8n: el registro más reciente es el bueno.
        conn.execute(text(INSERT_N8N), {"codigo": "111111111", "existencia": 10, "precio": 2.32})

    _ejecutar_sql(engine, MIGRACIONES / "001_creacion_sync_up.sql")

    # dry-run con 001 (n8n aún activo): no escribe en creacion.
    antes = _todas(engine)
    r = _sync(engine, BASE, dry_run=True)
    assert (r.insertados, r.actualizados, r.inactivados) == (0, 0, 0)
    assert _todas(engine) == antes

    # El modo real exige la migración de corte.
    with pytest.raises(worker.ConfiguracionError):
        _sync(engine, BASE)

    _ejecutar_sql(engine, MIGRACIONES / "002_creacion_corte_up.sql")
    assert len([f for f in _todas(engine) if f.vigente]) == 3

    r = _sync(engine, BASE)
    assert (r.insertados, r.actualizados, r.inactivados) == (0, 0, 0)
    assert r.hash_completados == 3

    # Reversión exacta de 002.
    _ejecutar_sql(engine, MIGRACIONES / "002_creacion_corte_down.sql")
    assert len([f for f in _todas(engine) if f.vigente]) == 4


def test_truncate_bloqueado_tras_el_corte(db):
    _sync(db, BASE)
    with pytest.raises(DBAPIError, match="bloqueado"):
        with db.begin() as conn:
            conn.exec_driver_sql("TRUNCATE TABLE public.creacion RESTART IDENTITY")
    assert len(_vigentes(db)) == 3


# ------------------------------------------------------------
# Fallos y seguridad
# ------------------------------------------------------------


def test_caida_de_sql_server_reintenta_y_no_toca_datos(db):
    _sync(db, BASE)
    antes = _todas(db)
    llamadas = {"n": 0}

    def lector_caido():
        llamadas["n"] += 1
        raise OrigenNoDisponibleError("timeout")

    with pytest.raises(OrigenNoDisponibleError):
        worker.ejecutar_sincronizacion(engine=db, config=CONFIG, leer_origen=lector_caido)

    assert llamadas["n"] == CONFIG.reintentos
    assert _todas(db) == antes
    ultima = _ejecuciones(db)[-1]
    assert ultima.estado == "FALLIDA" and ultima.intentos == CONFIG.reintentos


def test_reintento_exitoso_tras_fallo_transitorio(db):
    estado = {"n": 0}

    def lector():
        estado["n"] += 1
        if estado["n"] == 1:
            raise OrigenNoDisponibleError("red")
        return BASE, {"permisos_escritura": []}

    r = worker.ejecutar_sincronizacion(engine=db, config=CONFIG, leer_origen=lector)
    assert r.estado == "EXITOSA" and r.intentos_origen == 2


def test_error_en_transaccion_postgres_revierte_todo(db, monkeypatch):
    _sync(db, BASE)
    antes = _todas(db)
    original = worker._aplicar_diferencias

    def aplicar_y_fallar(conn, ejecucion_id):
        original(conn, ejecucion_id)  # ya insertó/actualizó/inactivó...
        conn.execute(text("SELECT 1/0"))  # ...y falla antes del commit

    monkeypatch.setattr(worker, "_aplicar_diferencias", aplicar_y_fallar)

    with pytest.raises(DBAPIError):
        _sync(db, [
            _origen("111111111", PrecioDetalUSDMasIVA=Decimal("9")),  # update
            BASE[1],
            _origen("555555555"),  # insert; 333333333 -> baja
        ])

    assert _todas(db) == antes
    assert _ejecuciones(db)[-1].estado == "FALLIDA"
    with db.connect() as conn:
        estado = conn.execute(text("SELECT * FROM public.sincronizacion_estado")).one()
    assert estado.ultimo_estado == "FALLIDA"
    assert estado.ultimo_exito_en is not None  # conserva el último éxito


def test_dos_workers_no_se_solapan(db):
    with db.connect() as otro:
        otro.execute(text("SELECT pg_advisory_lock(:k)"), {"k": worker.LOCK_KEY})
        r = _sync(db, BASE)
        otro.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": worker.LOCK_KEY})

    assert r.estado == "OMITIDA"
    assert _vigentes(db) == {}


def test_dos_workers_concurrentes_no_duplican(db):
    resultados = []

    def correr():
        resultados.append(_sync(db, BASE))

    hilos = [threading.Thread(target=correr) for _ in range(2)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=30)

    # Uno sincroniza; el otro queda OMITIDA o encuentra todo sin cambios.
    assert len(resultados) == 2
    assert all(r.estado in ("EXITOSA", "OMITIDA") for r in resultados)
    assert sum(r.insertados for r in resultados) == 3
    with db.connect() as conn:
        duplicados = conn.execute(
            text(
                "SELECT count(*) FROM (SELECT codigo_barra FROM public.creacion "
                "WHERE vigente GROUP BY 1 HAVING count(*) > 1) d"
            )
        ).scalar()
    assert duplicados == 0
    assert len(_vigentes(db)) == 3


def test_origen_vacio_no_inactiva_nada(db):
    _sync(db, BASE)
    with pytest.raises(worker.ControlSeguridadError):
        _sync(db, [])
    assert len(_vigentes(db)) == 3


def test_bajas_masivas_se_bloquean_salvo_forzar(db):
    _sync(db, BASE + [_origen("444444444")])
    with pytest.raises(worker.ControlSeguridadError):
        _sync(db, [BASE[0]])  # 75% de bajas > 50%
    assert len(_vigentes(db)) == 4

    r = _sync(db, [BASE[0]], forzar=True)
    assert r.inactivados == 3


def test_dry_run_no_escribe_en_creacion(db):
    _sync(db, BASE)
    antes = _todas(db)
    r = _sync(db, [BASE[0], _origen("222222222", Existencia=Decimal("1")), _origen("999999999")], dry_run=True)
    assert (r.insertados, r.actualizados, r.inactivados) == (1, 1, 1)
    assert r.detalle["muestra_nuevos"] == ["999999999"]
    assert r.detalle["muestra_cambiados"] == ["222222222"]
    assert r.detalle["muestra_bajas"] == ["333333333"]
    assert _todas(db) == antes
    assert _ejecuciones(db)[-1].modo == "DRY_RUN"


def test_ejecucion_registra_totales_y_estado(db):
    r = _sync(db, BASE + [_origen("bad")])
    ej = _ejecuciones(db)[-1]
    assert ej.id == r.ejecucion_id
    assert (ej.estado, ej.total_origen, ej.total_validos, ej.descartados, ej.insertados) == (
        "EXITOSA", 4, 3, 1, 3,
    )
    assert ej.duracion_ms is not None and ej.finalizado_en is not None
    with db.connect() as conn:
        estado = conn.execute(text("SELECT * FROM public.sincronizacion_estado")).one()
    assert estado.ultimo_estado == "EXITOSA" and estado.ultimo_exito_ejecucion_id == r.ejecucion_id


def test_ejecucion_huerfana_queda_abortada(db):
    with db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.sincronizacion_ejecucion (proceso, modo, estado) "
                "VALUES ('creacion', 'REAL', 'EN_CURSO')"
            )
        )
    _sync(db, BASE)
    assert _ejecuciones(db)[0].estado == "ABORTADA"


# ------------------------------------------------------------
# Fuente AGENTE (fase 4): lo que envió el agente del PC de creación
# ------------------------------------------------------------

CONFIG_AGENTE = ConfigSync(**{**CONFIG.__dict__, "fuente": "AGENTE", "dim_id_creacion": 2010, "espera_agente_segundos": 120})

DDL_AGENTE_FILA = """
CREATE TABLE public.agente_fila (
    id BIGSERIAL PRIMARY KEY, dim_id_tienda INTEGER NOT NULL, tarea VARCHAR(30) NOT NULL,
    clave VARCHAR(400) NOT NULL, datos JSONB NOT NULL, fila_hash CHAR(64) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE, ultimo_snapshot_id UUID NULL,
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agente_fila_tarea_check CHECK (tarea IN ('transferencias', 'devoluciones', 'usuarios')),
    UNIQUE (dim_id_tienda, tarea, clave)
)
"""


def _como_agente(fila):
    """Los datos como los envía qa_agent (task_value): todo texto, BIT como 'true'/'false'."""
    def valor(v):
        if v is None:
            return None
        if isinstance(v, bool):
            return "true" if v else "false"
        return format(v.normalize(), "f") if isinstance(v, Decimal) else str(v)
    return {k: valor(v) for k, v in fila.items()}


@pytest.fixture()
def db_agente(db):
    with db.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS public.agente_fila")
        conn.exec_driver_sql(DDL_AGENTE_FILA)
    _ejecutar_sql(db, MIGRACIONES / "007_agente_creacion_up.sql")
    return db


def _enviar(engine, filas, *, dim=2010, hace="10 minutes", activo=True):
    import json

    with engine.begin() as conn:
        for fila in filas:
            conn.execute(
                text(
                    """
                    INSERT INTO public.agente_fila (dim_id_tienda, tarea, clave, datos, fila_hash, activo, recibido_at)
                    VALUES (:dim, 'creacion', :clave, CAST(:datos AS JSONB), repeat('a', 64), :activo, now() - CAST(:hace AS interval))
                    ON CONFLICT (dim_id_tienda, tarea, clave) DO UPDATE SET
                        datos = EXCLUDED.datos, activo = EXCLUDED.activo, recibido_at = EXCLUDED.recibido_at
                    """
                ),
                {"dim": dim, "clave": fila["CodigoBarra"], "datos": json.dumps(_como_agente(fila)), "activo": activo, "hace": hace},
            )


def _sync_agente(engine, **kwargs):
    return worker.ejecutar_sincronizacion(engine=engine, config=CONFIG_AGENTE, **kwargs)


def test_agente_carga_lo_enviado_y_luego_no_repite(db_agente):
    _enviar(db_agente, BASE)
    _enviar(db_agente, [_origen("999999999")], dim=2004)  # otro sitio: no cuenta
    r = _sync_agente(db_agente)
    assert (r.estado, r.insertados, r.inactivados) == ("EXITOSA", 3, 0)
    assert set(_vigentes(db_agente)) == {"111111111", "222222222", "333333333"}
    assert _vigentes(db_agente)["111111111"].precio_detal_usd_mas_iva == Decimal("2.32")
    assert _vigentes(db_agente)["111111111"].status_origen == "true"
    # Sin envíos nuevos: no se registra otra ejecución.
    antes = len(_ejecuciones(db_agente))
    assert _sync_agente(db_agente).estado == "SIN_CAMBIOS"
    assert len(_ejecuciones(db_agente)) == antes


def test_agente_mismos_valores_que_sql_server_no_cuentan_cambios(db_agente):
    assert _sync(db_agente, BASE).insertados == 3
    _enviar(db_agente, BASE)
    r = _sync_agente(db_agente)
    assert (r.estado, r.insertados, r.actualizados, r.inactivados) == ("EXITOSA", 0, 0, 0)


def test_agente_cambio_y_baja(db_agente):
    _enviar(db_agente, BASE)
    _sync_agente(db_agente)
    _enviar(db_agente, [_origen("111111111", PrecioDetalUSDMasIVA=Decimal("3.00"))], hace="5 minutes")
    _enviar(db_agente, [_origen("333333333")], hace="5 minutes", activo=False)
    r = _sync_agente(db_agente)
    assert (r.estado, r.actualizados, r.inactivados) == ("EXITOSA", 1, 1)
    assert _vigentes(db_agente)["111111111"].precio_detal_usd_mas_iva == Decimal("3.00")
    assert "333333333" not in _vigentes(db_agente)


def test_agente_sin_datos_o_enviando_se_omite(db_agente):
    r = _sync_agente(db_agente)
    assert r.estado == "OMITIDA" and "todavía no ha enviado" in r.error
    _enviar(db_agente, BASE, hace="10 seconds")
    r = _sync_agente(db_agente)
    assert r.estado == "OMITIDA" and "está enviando" in r.error
    assert _vigentes(db_agente) == {}


def test_agente_conserva_el_limite_de_bajas(db_agente):
    _enviar(db_agente, BASE)
    _sync_agente(db_agente)
    _enviar(db_agente, BASE[1:], hace="5 minutes", activo=False)
    with pytest.raises(worker.ControlSeguridadError):
        _sync_agente(db_agente)
    assert len(_vigentes(db_agente)) == 3
