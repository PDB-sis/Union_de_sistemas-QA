from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InventarioDetalle(Base):
    __tablename__ = "inventario_detalle"

    __table_args__ = (
        CheckConstraint(
            "numero_fila_archivo IS NULL OR numero_fila_archivo >= 1",
            name="ck_inventario_detalle_numero_fila",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    inventario_carga_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "inventario_carga.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    numero_fila_archivo: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    tasa_cambio: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6),
        nullable=True,
    )

    fecha_tasa_cambio: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    codigo_barra: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    referencia: Mapped[str | None] = mapped_column(
        String(180),
        nullable=True,
    )

    codigo_marca: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    concatenado: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    marca: Mapped[str | None] = mapped_column(
        String(180),
        nullable=True,
    )

    descripcion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    existencia: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2),
        nullable=True,
    )

    codigo_categoria: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    precio_promocion: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    costo_inicial: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    costo_dolar: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    precio_detal_usd_mas_iva: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    precio_detal_mas_iva: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    precio_mayor_usd_mas_iva: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    precio_mayor_mas_iva: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
