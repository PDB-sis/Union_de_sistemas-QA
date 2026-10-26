from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SucursalCreate(BaseModel):
    empresa_id: int
    codigo: str | None = Field(
        default=None,
        max_length=50,
    )
    nombre: str = Field(
        min_length=1,
        max_length=180,
    )
    identificador_inventario: str | None = Field(
        default=None,
        max_length=255,
    )
    activo: bool = True


class SucursalResponse(BaseModel):
    id: int
    empresa_id: int
    codigo: str | None
    nombre: str
    identificador_inventario: str | None
    activo: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
