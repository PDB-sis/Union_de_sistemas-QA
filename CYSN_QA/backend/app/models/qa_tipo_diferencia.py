from sqlalchemy import (
    Boolean,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class QATipoDiferencia(Base):
    __tablename__ = "qa_tipo_diferencia"

    id: Mapped[int] = mapped_column(
        SmallInteger,
        primary_key=True,
    )

    codigo: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        unique=True,
    )

    nombre: Mapped[str] = mapped_column(
        String(160),
        nullable=False,
    )

    orden_visual: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100,
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )