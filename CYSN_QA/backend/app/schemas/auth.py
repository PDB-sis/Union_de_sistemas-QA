from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=100,
    )
    password: str = Field(
        min_length=1,
    )


class LoginResponse(BaseModel):
    authenticated: bool
    access_token: str
    token_type: str
    user_id: int
    username: str
    nombre: str
    email: str | None
    rol_id: int
    rol: str


class CurrentUserResponse(BaseModel):
    user_id: int
    username: str
    nombre: str
    email: str | None
    rol_id: int
    rol: str
    activo: bool


class RoleAccessResponse(BaseModel):
    authorized: bool
    user_id: int
    username: str
    rol: str
