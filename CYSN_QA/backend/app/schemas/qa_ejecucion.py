from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class QAEjecucionCreate(BaseModel):
    nombre: str = Field(
        min_length=1,
        max_length=180,
    )

    fecha_referencia: date | None = None

    descripcion: str | None = None


class QAEjecucionResponse(BaseModel):
    id: int

    qa_ciclo_id: int | None

    nombre: str

    fecha_referencia: date | None

    estado: str

    descripcion: str | None

    fecha_inicio: datetime

    fecha_fin: datetime | None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )