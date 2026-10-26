from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserSucursalCreate(BaseModel):
    user_id: int
    sucursal_id: int


class UserSucursalResponse(BaseModel):
    user_id: int
    sucursal_id: int
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
