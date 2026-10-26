from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class UserSucursal(Base):
    __tablename__ = "user_sucursal"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "user.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    sucursal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "sucursal.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
