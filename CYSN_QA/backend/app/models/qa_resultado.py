from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


qa_estado_comparacion_enum = ENUM(
    "IGUAL",
    "DIFERENCIA",
    "NO_EN_EMPRESAS",
    "NO_EN_CREACION",
    name="qa_estado_comparacion",
    create_type=False,
)


class QAResultado(Base):
    __tablename__ = "qa_resultado"

    __table_args__ = (
        UniqueConstraint(
            "qa_importacion_id",
            "numero_fila_origen",
            name="uq_resultado_importacion_fila",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
    )

    qa_ejecucion_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_ejecucion.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    qa_importacion_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_importacion.id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    numero_fila_origen: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    sucursal_origen: Mapped[str | None] = mapped_column(
        Text
    )

    estado_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    tabla_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    codigo_barra: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    referencia_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    codigo_marca_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    precio_detal_usd_creacion: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    tasa_cambio_creacion: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    status_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    sucursal_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    referencia_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    codigo_marca_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    precio_detal_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    precio_detal_usd_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    tasa_cambio_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    precio_detal_usd_calculado_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    status_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    existencia_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 4)
    )

    costo_inicial_creacion: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    costo_inicial_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    costo_dolar_creacion: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    costo_dolar_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    categoria_creacion: Mapped[str | None] = mapped_column(
        Text
    )

    categoria_empresa: Mapped[str | None] = mapped_column(
        Text
    )

    precio_promocion_creacion: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    precio_promocion_empresa: Mapped[
        Decimal | None
    ] = mapped_column(
        Numeric(20, 6)
    )

    estado_comparacion: Mapped[str] = mapped_column(
        qa_estado_comparacion_enum,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )