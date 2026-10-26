from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


qa_estado_correccion_enum = ENUM(
    "PENDIENTE",
    "CORREGIDO",
    name="qa_estado_correccion",
    create_type=False,
)


class QADiferencia(Base):
    __tablename__ = "qa_diferencia"

    __table_args__ = (
        UniqueConstraint(
            "qa_resultado_id",
            "tipo_diferencia_id",
            name="uq_resultado_tipo_diferencia",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
    )

    qa_resultado_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_resultado.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    tipo_diferencia_id: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey(
            "qa_tipo_diferencia.id"
        ),
        nullable=False,
    )

    valor_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    valor_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    diferencia_numerica: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    estado_correccion: Mapped[str] = mapped_column(
        qa_estado_correccion_enum,
        nullable=False,
        server_default=text("'PENDIENTE'"),
    )

    corregido_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )