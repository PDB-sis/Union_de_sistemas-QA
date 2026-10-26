"""Recepción autenticada de cambios de inventario enviados por agentes de sucursal."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.security import hash_token_agente

router = APIRouter(prefix="/api/agente/v1", tags=["agente-tienda"])


class InventarioAgenteFila(BaseModel):
    codigo_barra: str = Field(min_length=1, max_length=100)
    referencia: str | None = Field(default=None, max_length=180)
    codigo_marca: str | None = Field(default=None, max_length=100)
    concatenado: str | None = Field(default=None, max_length=255)
    marca: str | None = Field(default=None, max_length=180)
    descripcion: str | None = None
    codigo_categoria: str | None = Field(default=None, max_length=100)
    nombre_categoria: str | None = Field(default=None, max_length=180)
    # Categoría padre (línea de PDMC). Los agentes compilados antes del 2026-10-22 no la envían.
    linea: str | None = Field(default=None, max_length=180)
    status: str | None = Field(default=None, max_length=100)
    existencia: Decimal | None = None
    tasa_cambio: Decimal | None = None
    fecha_tasa_cambio: datetime | None = None
    precio_promocion: Decimal | None = None
    costo_inicial: Decimal | None = None
    costo_dolar: Decimal | None = None
    precio_detal_usd_mas_iva: Decimal | None = None
    precio_detal_mas_iva: Decimal | None = None
    precio_mayor_usd_mas_iva: Decimal | None = None
    precio_mayor_mas_iva: Decimal | None = None
    origen_actualizado_at: datetime | None = None
    activo: bool = True
    fila_hash: str = Field(min_length=64, max_length=64)

    @field_validator(
        "codigo_barra", "referencia", "codigo_marca", "concatenado", "marca", "descripcion",
        "codigo_categoria", "nombre_categoria", "linea", "status",
        mode="before",
    )
    @classmethod
    def convertir_a_texto(cls, value: object) -> object:
        """SQL Server entrega códigos numéricos y BIT; se guardan como texto (mismo criterio que a_texto)."""
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, Decimal):
            return "0" if value == 0 else format(value.normalize(), "f")
        if isinstance(value, (int, float)):
            return str(value)
        return value

    @field_validator("codigo_barra")
    @classmethod
    def limpiar_codigo(cls, value: str) -> str:
        limpio = value.strip()
        if not limpio:
            raise ValueError("codigo_barra no puede estar vacío")
        return limpio


class SincronizacionAgenteRequest(BaseModel):
    lote_id: UUID
    modo: Literal["INCREMENTAL", "INICIAL", "RECONCILIACION"]
    snapshot_id: UUID | None = None
    es_ultimo_lote: bool = False
    cursor_origen: datetime | None = None
    tasa_firma: str | None = Field(default=None, max_length=128)
    filas: list[InventarioAgenteFila] = Field(min_length=1, max_length=1000)


class SincronizacionAgenteResponse(BaseModel):
    aceptado: bool = True
    repetido: bool = False
    sucursal_id: int | None
    dim_id_tienda: int | None = None
    recibidas: int
    insertadas_o_actualizadas: int
    pendientes_qa: int


def _error_agente() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agente no autorizado.")


def _serializar_fila(fila: InventarioAgenteFila) -> dict:
    """La huella la calcula el agente; el servidor vuelve a validarla."""
    datos = fila.model_dump(mode="json")
    datos.pop("fila_hash", None)
    # Sin línea, la huella queda igual que antes de existir el campo (agentes anteriores).
    if datos.get("linea") is None:
        datos.pop("linea", None)
    return datos


def _hash_fila(fila: InventarioAgenteFila) -> str:
    contenido = json.dumps(_serializar_fila(fila), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(contenido.encode("utf-8")).hexdigest()


def _autenticar_agente(db: Session, codigo: str, token: str):
    """El sitio del agente: su sucursal de CYSN (tiendas) y/o su dimID_Tienda (tiendas y bodegas)."""
    agente = db.execute(
        text("""
            SELECT a.id, a.sucursal_id, COALESCE(a.dim_id_tienda, s.dim_id_tienda) AS dim_id_tienda
            FROM agente_sucursal a LEFT JOIN sucursal s ON s.id = a.sucursal_id
            WHERE a.codigo = :codigo
              AND a.token_hash = :token_hash
              AND a.activo = TRUE
        """),
        {"codigo": codigo.strip(), "token_hash": hash_token_agente(token)},
    ).mappings().first()
    if agente is None:
        raise _error_agente()
    return agente


class LatidoAgenteResponse(BaseModel):
    sucursal_id: int | None
    dim_id_tienda: int | None = None
    ultimo_contacto_at: datetime


@router.post("/latido", response_model=LatidoAgenteResponse)
def recibir_latido(
    x_agente_codigo: str = Header(..., min_length=3, max_length=80),
    x_agente_token: str = Header(..., min_length=32, max_length=512),
    db: Session = Depends(get_db),
):
    """El agente lo envía en cada ciclo sin cambios: ultimo_contacto_at indica que sigue vivo."""
    agente = _autenticar_agente(db, x_agente_codigo, x_agente_token)
    contacto = db.execute(
        text("UPDATE agente_sucursal SET ultimo_contacto_at = now() WHERE id = :id RETURNING ultimo_contacto_at"),
        {"id": agente["id"]},
    ).scalar_one()
    db.commit()
    return LatidoAgenteResponse(sucursal_id=agente["sucursal_id"], dim_id_tienda=agente["dim_id_tienda"], ultimo_contacto_at=contacto)


@router.post("/inventario/sincronizaciones", response_model=SincronizacionAgenteResponse)
def recibir_sincronizacion(
    datos: SincronizacionAgenteRequest,
    x_agente_codigo: str = Header(..., min_length=3, max_length=80),
    x_agente_token: str = Header(..., min_length=32, max_length=512),
    db: Session = Depends(get_db),
):
    """Upsert idempotente. Solo acepta conexiones que conocen el token de una sucursal."""
    agente = _autenticar_agente(db, x_agente_codigo, x_agente_token)

    # Sitio de las filas: la sucursal (tiendas de CYSN) manda sobre el dimID para no duplicar
    # filas guardadas antes de enlazar la sucursal; las bodegas solo tienen dimID.
    sucursal_id, dim_id = agente["sucursal_id"], agente["dim_id_tienda"]
    if sucursal_id is not None:
        sitio, clave, conflicto = "sucursal_id = :sitio", sucursal_id, "(sucursal_id, codigo_barra)"
    else:
        sitio, clave, conflicto = "dim_id_tienda = :sitio", dim_id, "(dim_id_tienda, codigo_barra)"

    def respuesta(**valores) -> SincronizacionAgenteResponse:
        return SincronizacionAgenteResponse(sucursal_id=sucursal_id, dim_id_tienda=dim_id, recibidas=len(datos.filas), **valores)

    def marcar_pendiente(codigo_barra: str) -> None:
        # La cola de QA es por sucursal: las bodegas no participan en los ciclos QA.
        if sucursal_id is None:
            return
        db.execute(
            text("""
                INSERT INTO inventario_agente_pendiente (sucursal_id, codigo_barra, detectado_at)
                VALUES (:sucursal_id, :codigo_barra, now())
                ON CONFLICT (sucursal_id, codigo_barra) DO UPDATE SET detectado_at = now()
            """),
            {"sucursal_id": sucursal_id, "codigo_barra": codigo_barra},
        )

    existe_lote = db.execute(
        text("""
            SELECT 1 FROM inventario_agente_lote
            WHERE agente_sucursal_id = :agente_id AND lote_id = :lote_id
        """),
        {"agente_id": agente["id"], "lote_id": str(datos.lote_id)},
    ).scalar()
    if existe_lote:
        return respuesta(repetido=True, insertadas_o_actualizadas=0, pendientes_qa=0)

    cambiadas = 0
    for fila in datos.filas:
        # La huella se calcula nuevamente en el servidor; el valor del agente es solo diagnostico.
        valores = fila.model_dump()
        valores["fila_hash"] = _hash_fila(fila)
        valores.update({
            "sucursal_id": sucursal_id,
            "dim_id_tienda": dim_id,
            "snapshot_id": str(datos.snapshot_id) if datos.snapshot_id else None,
        })
        resultado = db.execute(
            text(f"""
                INSERT INTO inventario_agente_actual (
                    sucursal_id, dim_id_tienda, codigo_barra, referencia, codigo_marca, concatenado, marca,
                    descripcion, codigo_categoria, nombre_categoria, linea, status, existencia,
                    tasa_cambio, fecha_tasa_cambio, precio_promocion, costo_inicial, costo_dolar,
                    precio_detal_usd_mas_iva, precio_detal_mas_iva,
                    precio_mayor_usd_mas_iva, precio_mayor_mas_iva,
                    origen_actualizado_at, activo, fila_hash, ultimo_snapshot_id, recibido_at
                ) VALUES (
                    :sucursal_id, :dim_id_tienda, :codigo_barra, :referencia, :codigo_marca, :concatenado, :marca,
                    :descripcion, :codigo_categoria, :nombre_categoria, :linea, :status, :existencia,
                    :tasa_cambio, :fecha_tasa_cambio, :precio_promocion, :costo_inicial, :costo_dolar,
                    :precio_detal_usd_mas_iva, :precio_detal_mas_iva,
                    :precio_mayor_usd_mas_iva, :precio_mayor_mas_iva,
                    :origen_actualizado_at, :activo, :fila_hash, :snapshot_id, now()
                )
                ON CONFLICT {conflicto} DO UPDATE SET
                    dim_id_tienda = EXCLUDED.dim_id_tienda,
                    referencia = EXCLUDED.referencia, codigo_marca = EXCLUDED.codigo_marca,
                    concatenado = EXCLUDED.concatenado, marca = EXCLUDED.marca,
                    descripcion = EXCLUDED.descripcion, codigo_categoria = EXCLUDED.codigo_categoria,
                    nombre_categoria = EXCLUDED.nombre_categoria, linea = EXCLUDED.linea,
                    status = EXCLUDED.status,
                    existencia = EXCLUDED.existencia, tasa_cambio = EXCLUDED.tasa_cambio,
                    fecha_tasa_cambio = EXCLUDED.fecha_tasa_cambio,
                    precio_promocion = EXCLUDED.precio_promocion, costo_inicial = EXCLUDED.costo_inicial,
                    costo_dolar = EXCLUDED.costo_dolar,
                    precio_detal_usd_mas_iva = EXCLUDED.precio_detal_usd_mas_iva,
                    precio_detal_mas_iva = EXCLUDED.precio_detal_mas_iva,
                    precio_mayor_usd_mas_iva = EXCLUDED.precio_mayor_usd_mas_iva,
                    precio_mayor_mas_iva = EXCLUDED.precio_mayor_mas_iva,
                    origen_actualizado_at = EXCLUDED.origen_actualizado_at,
                    activo = EXCLUDED.activo, fila_hash = EXCLUDED.fila_hash,
                    ultimo_snapshot_id = COALESCE(EXCLUDED.ultimo_snapshot_id, inventario_agente_actual.ultimo_snapshot_id),
                    recibido_at = now()
                WHERE inventario_agente_actual.fila_hash IS DISTINCT FROM EXCLUDED.fila_hash
                   OR inventario_agente_actual.dim_id_tienda IS DISTINCT FROM EXCLUDED.dim_id_tienda
                RETURNING codigo_barra
            """), valores).scalar()
        if resultado is not None:
            cambiadas += 1
            marcar_pendiente(fila.codigo_barra)

    completo = datos.modo in {"INICIAL", "RECONCILIACION"} and datos.snapshot_id is not None
    if completo:
        # El upsert solo toca filas con huella distinta; las que no cambiaron también pertenecen al
        # snapshot y no deben darse de baja al cerrar la reconciliación.
        db.execute(
            text(f"""
                UPDATE inventario_agente_actual
                SET ultimo_snapshot_id = :snapshot_id
                WHERE {sitio}
                  AND codigo_barra = ANY(:codigos)
                  AND ultimo_snapshot_id IS DISTINCT FROM :snapshot_id
            """),
            {"sitio": clave, "snapshot_id": str(datos.snapshot_id),
             "codigos": [fila.codigo_barra for fila in datos.filas]},
        )

    if completo and datos.es_ultimo_lote:
        bajas = db.execute(
            text(f"""
                UPDATE inventario_agente_actual
                -- Huella neutra: si el producto reaparece igual, el upsert debe reactivarlo.
                SET activo = FALSE, fila_hash = repeat('0', 64), recibido_at = now()
                WHERE {sitio}
                  AND activo = TRUE
                  AND ultimo_snapshot_id IS DISTINCT FROM :snapshot_id
                RETURNING codigo_barra
            """),
            {"sitio": clave, "snapshot_id": str(datos.snapshot_id)},
        ).scalars().all()
        for codigo_barra in bajas:
            cambiadas += 1
            marcar_pendiente(codigo_barra)

    db.execute(
        text("""
            INSERT INTO inventario_agente_lote (agente_sucursal_id, lote_id, modo, filas_recibidas, cursor_origen, tasa_firma)
            VALUES (:agente_id, :lote_id, :modo, :filas_recibidas, :cursor_origen, :tasa_firma)
        """),
        {"agente_id": agente["id"], "lote_id": str(datos.lote_id), "modo": datos.modo,
         "filas_recibidas": len(datos.filas), "cursor_origen": datos.cursor_origen, "tasa_firma": datos.tasa_firma},
    )
    db.execute(text("UPDATE agente_sucursal SET ultimo_contacto_at = now() WHERE id = :id"), {"id": agente["id"]})
    pendientes = 0
    if sucursal_id is not None:
        pendientes = db.execute(
            text("SELECT count(*) FROM inventario_agente_pendiente WHERE sucursal_id = :sucursal_id"),
            {"sucursal_id": sucursal_id},
        ).scalar_one()
    db.commit()
    return respuesta(insertadas_o_actualizadas=cambiadas, pendientes_qa=int(pendientes))
