"""Recepción de las tareas que envían los agentes: transferencias, devoluciones y usuarios (bodegas, para PDMC)
y creacion (PC de creación, para CYSN).

Las filas se guardan en bruto, por sitio (dimID_Tienda), tarea y clave, en agente_fila. PDMC las procesa
después con sus propios importadores (fase 3b) y CYSN con app.sync.creacion (fase 4). Nunca se borra: lo que desaparece del origen queda inactivo.
"""
from __future__ import annotations

import hashlib
import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.routers.agente_tienda import _autenticar_agente

router = APIRouter(prefix="/api/agente/v1", tags=["agente-tienda"])

Tarea = Literal["transferencias", "devoluciones", "usuarios", "creacion"]


class FilaAgente(BaseModel):
    clave: str = Field(min_length=1, max_length=400)
    datos: dict[str, str | None] | None = None
    fila_hash: str | None = Field(default=None, min_length=64, max_length=64)
    # La fila ya no aparece en la consulta del sitio: se da de baja.
    eliminada: bool = False

    @field_validator("clave")
    @classmethod
    def limpiar_clave(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("clave no puede estar vacía")
        return value

    @field_validator("datos")
    @classmethod
    def limitar_datos(cls, value: dict[str, str | None] | None) -> dict[str, str | None] | None:
        if value is None:
            return value
        if len(value) > 60 or any(len(k) > 80 or (v is not None and len(v) > 4000) for k, v in value.items()):
            raise ValueError("datos excede los límites (60 columnas, nombres de 80 y valores de 4000 caracteres)")
        return value

    @model_validator(mode="after")
    def datos_obligatorios(self) -> "FilaAgente":
        if not self.eliminada and not self.datos:
            raise ValueError("una fila que no se elimina debe traer datos")
        return self


class FilasAgenteRequest(BaseModel):
    lote_id: UUID
    tarea: Tarea
    modo: Literal["INCREMENTAL", "INICIAL", "RECONCILIACION"]
    snapshot_id: UUID | None = None
    es_ultimo_lote: bool = False
    filas: list[FilaAgente] = Field(min_length=1, max_length=1000)


class FilasAgenteResponse(BaseModel):
    aceptado: bool = True
    repetido: bool = False
    dim_id_tienda: int
    tarea: str
    recibidas: int
    insertadas_o_actualizadas: int
    eliminadas: int


def hash_datos(datos: dict[str, str | None]) -> str:
    """Misma huella que calcula el agente (qa_agent.fingerprint) sobre los datos de la fila."""
    contenido = json.dumps(datos, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(contenido.encode("utf-8")).hexdigest()


@router.post("/filas", response_model=FilasAgenteResponse)
def recibir_filas(
    datos: FilasAgenteRequest,
    x_agente_codigo: str = Header(..., min_length=3, max_length=80),
    x_agente_token: str = Header(..., min_length=32, max_length=512),
    db: Session = Depends(get_db),
):
    """Upsert idempotente por sitio, tarea y clave. Solo para agentes con dimID_Tienda."""
    agente = _autenticar_agente(db, x_agente_codigo, x_agente_token)
    dim_id = agente["dim_id_tienda"]
    if dim_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El agente no tiene sitio (dimID_Tienda): no puede enviar filas de tareas.",
        )

    def respuesta(**valores) -> FilasAgenteResponse:
        return FilasAgenteResponse(dim_id_tienda=dim_id, tarea=datos.tarea, recibidas=len(datos.filas), **valores)

    sitio = {"dim": dim_id, "tarea": datos.tarea}
    existe_lote = db.execute(
        text("SELECT 1 FROM agente_fila_lote WHERE agente_sucursal_id = :agente_id AND lote_id = :lote_id"),
        {"agente_id": agente["id"], "lote_id": str(datos.lote_id)},
    ).scalar()
    if existe_lote:
        return respuesta(repetido=True, insertadas_o_actualizadas=0, eliminadas=0)

    snapshot = str(datos.snapshot_id) if datos.snapshot_id else None
    cambiadas = eliminadas = 0
    for fila in datos.filas:
        if fila.eliminada:
            eliminadas += db.execute(
                text("""
                    UPDATE agente_fila SET activo = FALSE, fila_hash = repeat('0', 64), recibido_at = now()
                    WHERE dim_id_tienda = :dim AND tarea = :tarea AND clave = :clave AND activo
                """),
                {**sitio, "clave": fila.clave},
            ).rowcount
            continue
        resultado = db.execute(
            text("""
                INSERT INTO agente_fila (dim_id_tienda, tarea, clave, datos, fila_hash, activo, ultimo_snapshot_id, recibido_at)
                VALUES (:dim, :tarea, :clave, CAST(:datos AS JSONB), :fila_hash, TRUE, :snapshot, now())
                ON CONFLICT (dim_id_tienda, tarea, clave) DO UPDATE SET
                    datos = EXCLUDED.datos, fila_hash = EXCLUDED.fila_hash, activo = TRUE,
                    ultimo_snapshot_id = COALESCE(EXCLUDED.ultimo_snapshot_id, agente_fila.ultimo_snapshot_id),
                    recibido_at = now()
                WHERE agente_fila.fila_hash IS DISTINCT FROM EXCLUDED.fila_hash OR NOT agente_fila.activo
                RETURNING id
            """),
            # La huella se recalcula en el servidor; la del agente solo sirve de diagnóstico.
            {**sitio, "clave": fila.clave, "datos": json.dumps(fila.datos, ensure_ascii=False),
             "fila_hash": hash_datos(fila.datos), "snapshot": snapshot},
        ).scalar()
        if resultado is not None:
            cambiadas += 1

    completo = datos.modo in {"INICIAL", "RECONCILIACION"} and snapshot is not None
    if completo:
        # Las filas que no cambiaron también pertenecen a la fotografía completa.
        db.execute(
            text("""
                UPDATE agente_fila SET ultimo_snapshot_id = :snapshot
                WHERE dim_id_tienda = :dim AND tarea = :tarea AND clave = ANY(:claves)
                  AND ultimo_snapshot_id IS DISTINCT FROM :snapshot
            """),
            {**sitio, "snapshot": snapshot, "claves": [f.clave for f in datos.filas if not f.eliminada]},
        )
    if completo and datos.es_ultimo_lote:
        eliminadas += db.execute(
            text("""
                UPDATE agente_fila SET activo = FALSE, fila_hash = repeat('0', 64), recibido_at = now()
                WHERE dim_id_tienda = :dim AND tarea = :tarea AND activo
                  AND ultimo_snapshot_id IS DISTINCT FROM :snapshot
            """),
            {**sitio, "snapshot": snapshot},
        ).rowcount

    db.execute(
        text("""
            INSERT INTO agente_fila_lote (agente_sucursal_id, tarea, lote_id, modo, filas_recibidas)
            VALUES (:agente_id, :tarea, :lote_id, :modo, :filas)
        """),
        {"agente_id": agente["id"], "tarea": datos.tarea, "lote_id": str(datos.lote_id), "modo": datos.modo,
         "filas": len(datos.filas)},
    )
    db.execute(text("UPDATE agente_sucursal SET ultimo_contacto_at = now() WHERE id = :id"), {"id": agente["id"]})
    db.commit()
    return respuesta(insertadas_o_actualizadas=cambiadas, eliminadas=eliminadas)
