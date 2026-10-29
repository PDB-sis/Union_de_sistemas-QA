"""
Inventario de cada sucursal tomado de su agente para los ciclos QA.

Reemplaza la carga de CSV, que está retirada. Al ejecutar QA (o al marcar LISTO_QA, o
al visualizar una sucursal), cada sucursal PENDIENTE recibe una fotografía de lo que
envió su agente (inventario_agente_actual) como una carga de inventario más. El motor
QA (inventario_detalle vs creacion) no distingue el origen. Si no hay ciclo abierto,
«Ejecutar QA» crea uno con todas las sucursales que tienen inventario de agente.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.inventario_carga import InventarioCarga
from app.models.inventario_detalle import InventarioDetalle
from app.models.qa_ciclo import QACiclo
from app.models.qa_ciclo_sucursal import QACicloSucursal
from app.models.sucursal import Sucursal
from app.services.codigo_barra_service import (
    es_codigo_barra_valido,
    limpiar_codigo_barra,
)


# Columnas comunes a inventario_agente_actual e inventario_detalle.
COLUMNAS = (
    "tasa_cambio", "fecha_tasa_cambio", "referencia", "codigo_marca",
    "concatenado", "marca", "descripcion", "status", "existencia",
    "codigo_categoria", "precio_promocion", "costo_inicial", "costo_dolar",
    "precio_detal_usd_mas_iva", "precio_detal_mas_iva",
    "precio_mayor_usd_mas_iva", "precio_mayor_mas_iva",
)

# Lo que envió el agente de la sucursal, enlazado por sucursal_id o por su dimID_Tienda.
_SQL_INVENTARIO = text(
    f"""
    SELECT DISTINCT ON (codigo_barra) codigo_barra, {", ".join(COLUMNAS)}, recibido_at
    FROM inventario_agente_actual
    WHERE activo
      AND (
          sucursal_id = :sucursal_id
          OR dim_id_tienda = (SELECT dim_id_tienda FROM sucursal WHERE id = :sucursal_id)
      )
    ORDER BY codigo_barra, recibido_at DESC
    """
)

TAMANIO_LOTE = 1000


def tomar_inventario_agente(
    db: Session,
    participacion: QACicloSucursal,
    usuario_id: int,
) -> InventarioCarga | None:
    """Crea la carga VALIDADO de la sucursal con su inventario del agente; None si no hay."""
    filas = db.execute(
        _SQL_INVENTARIO, {"sucursal_id": participacion.sucursal_id}
    ).mappings().all()

    detalles: list[dict[str, Any]] = []
    for fila in filas:
        # Misma regla que la carga de CSV: los códigos fuera de la regla operativa se ignoran.
        codigo = limpiar_codigo_barra(fila["codigo_barra"])
        if not es_codigo_barra_valido(codigo) or len(codigo) > 100:
            continue
        detalles.append({"codigo_barra": codigo, **{c: fila[c] for c in COLUMNAS}})

    if not detalles:
        return None

    ahora = datetime.now(timezone.utc)
    ultimo_envio = max(fila["recibido_at"] for fila in filas)
    huella = hashlib.sha256(
        json.dumps([ahora.isoformat(), detalles], default=str).encode("utf-8")
    ).hexdigest()

    carga_actual = db.scalar(
        select(InventarioCarga).where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id,
            InventarioCarga.es_actual.is_(True),
        )
    )
    ultima_version = db.scalar(
        select(func.max(InventarioCarga.version)).where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id
        )
    )

    if carga_actual is not None:
        carga_actual.es_actual = False
        carga_actual.estado = "REEMPLAZADO"
        carga_actual.updated_at = ahora
        db.flush()

    carga = InventarioCarga(
        qa_ciclo_sucursal_id=participacion.id,
        cargado_por_user_id=usuario_id,
        version=int(ultima_version or 0) + 1,
        es_actual=True,
        reemplaza_carga_id=carga_actual.id if carga_actual is not None else None,
        archivo_nombre_original=(
            f"Inventario del agente (último envío {ultimo_envio:%Y-%m-%d %H:%M} UTC)"
        ),
        archivo_nombre_guardado=None,
        archivo_ruta=None,
        archivo_sha256=huella,
        archivo_tamano_bytes=None,
        estado="VALIDADO",
        total_registros=len(filas),
        registros_validos=len(detalles),
        registros_invalidos=len(filas) - len(detalles),
        error_mensaje=None,
        recibido_at=ahora,
        procesado_at=ahora,
        updated_at=ahora,
    )
    db.add(carga)
    db.flush()

    for inicio in range(0, len(detalles), TAMANIO_LOTE):
        db.add_all(
            InventarioDetalle(inventario_carga_id=carga.id, numero_fila_archivo=None, **detalle)
            for detalle in detalles[inicio:inicio + TAMANIO_LOTE]
        )
        db.flush()

    participacion.estado_recepcion = "VALIDADO"
    participacion.recibido_at = ahora
    participacion.validado_at = ahora
    participacion.observacion = "Inventario tomado del agente de la sucursal."
    participacion.updated_at = ahora

    return carga


_SQL_SUCURSALES_CON_AGENTE = text(
    """
    SELECT s.id
    FROM sucursal AS s
    JOIN empresa AS e ON e.id = s.empresa_id
    WHERE s.activo AND e.activo
      AND EXISTS (
          SELECT 1 FROM inventario_agente_actual AS i
          WHERE i.activo
            AND (i.sucursal_id = s.id OR (s.dim_id_tienda IS NOT NULL AND i.dim_id_tienda = s.dim_id_tienda))
      )
    ORDER BY s.id
    """
)


def asegurar_ciclo_operativo(db: Session, usuario_id: int) -> QACiclo:
    """El ciclo abierto (RECEPCION y, si no, PREPARANDO); si no hay, crea «QA <fecha>». No confirma."""
    for estado in ("RECEPCION", "PREPARANDO"):
        ciclo = db.scalar(
            select(QACiclo).where(QACiclo.estado == estado).order_by(QACiclo.id.desc())
        )
        if ciclo is not None:
            return ciclo

    hoy = date.today()
    ciclo = QACiclo(
        nombre=f"QA {hoy:%d/%m/%Y}",
        descripcion="Ciclo QA automático con el inventario que envían los agentes de las sucursales.",
        fecha_inicio=hoy,
        creado_por_user_id=usuario_id,
    )
    db.add(ciclo)
    db.flush()
    return ciclo


def agregar_sucursales_con_agente(db: Session, ciclo_id: int) -> int:
    """Añade al ciclo las sucursales activas que tienen inventario de agente. No confirma."""
    ids = db.scalars(_SQL_SUCURSALES_CON_AGENTE).all()
    existentes = set(
        db.scalars(
            select(QACicloSucursal.sucursal_id).where(QACicloSucursal.qa_ciclo_id == ciclo_id)
        ).all()
    )
    nuevas = [
        QACicloSucursal(qa_ciclo_id=ciclo_id, sucursal_id=sucursal_id, estado_recepcion="PENDIENTE")
        for sucursal_id in ids
        if sucursal_id not in existentes
    ]
    db.add_all(nuevas)
    db.flush()
    return len(nuevas)


def tomar_inventarios_pendientes(
    db: Session,
    ciclo_id: int,
    usuario_id: int,
) -> list[str]:
    """
    Toma el inventario del agente de cada sucursal PENDIENTE del ciclo.

    No confirma la transacción. Devuelve los nombres de las sucursales sin
    inventario de agente; si hay alguna, quien llama debe revertir.
    """
    sin_agente: list[str] = []
    pendientes = db.execute(
        select(QACicloSucursal, Sucursal.nombre)
        .join(Sucursal, Sucursal.id == QACicloSucursal.sucursal_id)
        .where(
            QACicloSucursal.qa_ciclo_id == ciclo_id,
            QACicloSucursal.estado_recepcion == "PENDIENTE",
        )
        .order_by(Sucursal.nombre)
    ).all()

    for participacion, nombre in pendientes:
        if tomar_inventario_agente(db, participacion, usuario_id) is None:
            sin_agente.append(nombre)

    return sin_agente
