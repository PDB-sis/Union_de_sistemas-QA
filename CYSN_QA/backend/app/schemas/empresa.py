from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EmpresaCreate(BaseModel):
    codigo: str | None = Field(
        default=None,
        max_length=50,
    )
    nombre: str = Field(
        min_length=1,
        max_length=180,
    )
    activo: bool = True


class EmpresaResponse(BaseModel):
    id: int
    codigo: str | None
    nombre: str
    activo: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
