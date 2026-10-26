from datetime import datetime

from pydantic import BaseModel, Field


class UsuarioSucursalResumen(BaseModel):
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    identificador_inventario: str | None
    sucursal_activa: bool
    empresa_activa: bool


class UsuarioAdminResponse(BaseModel):
    user_id: int
    username: str
    nombre: str
    email: str | None
    activo: bool
    ultimo_login_at: datetime | None
    rol_id: int
    rol: str
    total_sucursales: int
    sucursales: list[UsuarioSucursalResumen]
    created_at: datetime
    updated_at: datetime


class UsuarioAdminCreate(BaseModel):
    rol: str = Field(
        min_length=1,
        max_length=80,
    )
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
        min_length=8,
        max_length=255,
    )
    activo: bool = True
    sucursal_ids: list[int] = Field(
        default_factory=list,
    )


class UsuarioAdminUpdate(BaseModel):
    nombre: str | None = Field(
        default=None,
        min_length=1,
        max_length=180,
    )
    email: str | None = Field(
        default=None,
        max_length=180,
    )
    activo: bool | None = None


class UsuarioSucursalesUpdate(BaseModel):
    sucursal_ids: list[int] = Field(
        default_factory=list,
    )


class UsuarioPasswordReset(BaseModel):
    nueva_password: str = Field(
        min_length=8,
        max_length=255,
    )


class CambiarPasswordRequest(BaseModel):
    password_actual: str = Field(
        min_length=1,
    )
    nueva_password: str = Field(
        min_length=8,
        max_length=255,
    )


class UsuarioOperacionResponse(BaseModel):
    actualizado: bool
    user_id: int
    mensaje: str


class RolAdminResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    activo: bool


class SucursalAdminCatalogoResponse(BaseModel):
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    identificador_inventario: str | None
    sucursal_activa: bool
    empresa_activa: bool
