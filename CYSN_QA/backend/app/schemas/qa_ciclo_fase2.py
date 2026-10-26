from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class QACicloCreate(BaseModel):
    nombre: str = Field(
        min_length=1,
        max_length=180,
    )
    descripcion: str | None = None
    fecha_inicio: date
    fecha_fin: date | None = None

    @model_validator(mode="after")
    def validar_fechas(self):
        if (
            self.fecha_fin is not None
            and self.fecha_fin < self.fecha_inicio
        ):
            raise ValueError(
                "fecha_fin no puede ser anterior a fecha_inicio."
            )

        return self


class QACicloResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    fecha_inicio: date
    fecha_fin: date | None
    estado: str
    creado_por_user_id: int | None
    created_at: datetime
    updated_at: datetime


class QACicloSucursalesAddRequest(BaseModel):
    sucursal_ids: list[int] = Field(
        min_length=1,
    )


class QACicloSucursalResponse(BaseModel):
    id: int
    qa_ciclo_id: int
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    identificador_inventario: str | None
    estado_recepcion: str
    recibido_at: datetime | None
    validado_at: datetime | None
    observacion: str | None


class QACicloSucursalesAddResponse(BaseModel):
    qa_ciclo_id: int
    ciclo: str
    agregadas: int
    ya_existentes: int
    total_participantes: int
    sucursales_agregadas: list[QACicloSucursalResponse]


class QACicloRecepcionResumen(BaseModel):
    qa_ciclo_id: int
    ciclo: str
    estado: str
    total_participantes: int
    pendientes: int
    recibidos: int
    validados: int
    rechazados: int
    porcentaje_validado: float
    todos_validados: bool
