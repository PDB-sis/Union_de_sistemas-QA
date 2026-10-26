from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RolCreate(BaseModel):
    nombre: str = Field(
        min_length=1,
        max_length=80,
    )
    descripcion: str | None = None
    activo: bool = True


class RolResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    activo: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
