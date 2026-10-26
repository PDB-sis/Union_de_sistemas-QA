from pydantic import BaseModel, Field


class SucursalUserCreate(BaseModel):
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
    sucursal_id: int


class SucursalUserCreatedResponse(BaseModel):
    user_id: int
    username: str
    nombre: str
    rol: str
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str


class SucursalAsignadaResponse(BaseModel):
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    identificador_inventario: str | None

class SucursalAccessResponse(BaseModel):
    authorized: bool
    user_id: int
    username: str
    rol: str
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str

