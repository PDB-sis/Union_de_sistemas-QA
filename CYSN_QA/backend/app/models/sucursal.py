from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Sucursal(Base):
    __tablename__ = "sucursal"

    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "nombre",
            name="uq_sucursal_empresa_nombre",
        ),
        UniqueConstraint(
            "empresa_id",
            "codigo",
            name="uq_sucursal_empresa_codigo",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    empresa_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "empresa.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    codigo: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    nombre: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )

    identificador_inventario: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        unique=True,
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="true",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
