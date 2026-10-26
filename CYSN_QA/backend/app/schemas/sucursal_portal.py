from datetime import date, datetime

from pydantic import BaseModel


class SucursalRecepcionPortalResponse(BaseModel):
    qa_ciclo_id: int
    ciclo: str
    estado_ciclo: str
    fecha_inicio: date | None
    fecha_fin: date | None

    qa_ciclo_sucursal_id: int

    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    identificador_inventario: str | None

    estado_recepcion: str
    recibido_at: datetime | None
    validado_at: datetime | None
    observacion: str | None

    carga_id: int | None
    carga_version: int | None
    estado_carga: str | None
    archivo_nombre: str | None
    total_registros: int | None
    registros_validos: int | None
    registros_invalidos: int | None
    carga_recibido_at: datetime | None
    carga_procesado_at: datetime | None

    puede_cargar_inventario: bool
