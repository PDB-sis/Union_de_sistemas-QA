from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    rol_id: int
    username: str = Field(
        min_length=1,
        max_length=100,
    )
    nombre: str = Field(
        min_length=1,
        max_length=180,
    )
    email: str | None = Field(
        default=None,
        max_length=180,
    )
    password: str = Field(
        min_length=1,
    )
    activo: bool = True


class UserResponse(BaseModel):
    id: int
    rol_id: int
    username: str
    nombre: str
    email: str | None
    activo: bool
    ultimo_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
