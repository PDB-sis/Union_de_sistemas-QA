from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InventarioCarga(Base):
    __tablename__ = "inventario_carga"

    __table_args__ = (
        UniqueConstraint(
            "qa_ciclo_sucursal_id",
            "version",
            name="uq_inventario_carga_version",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_inventario_carga_version",
        ),
        CheckConstraint(
            "archivo_tamano_bytes IS NULL OR archivo_tamano_bytes >= 0",
            name="ck_inventario_carga_tamano",
        ),
        CheckConstraint(
            "total_registros >= 0 AND registros_validos >= 0 AND registros_invalidos >= 0",
            name="ck_inventario_carga_totales",
        ),
        CheckConstraint(
            "estado IN ('RECIBIDO','PROCESANDO','VALIDADO','RECHAZADO','ERROR','REEMPLAZADO')",
            name="ck_inventario_carga_estado",
        ),
        Index(
            "uq_inventario_carga_actual",
            "qa_ciclo_sucursal_id",
            unique=True,
            postgresql_where=text("es_actual = TRUE"),
        ),
        Index(
            "uq_inventario_carga_hash",
            "qa_ciclo_sucursal_id",
            "archivo_sha256",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    qa_ciclo_sucursal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_ciclo_sucursal.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    cargado_por_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "user.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )

    es_actual: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("TRUE"),
    )

    reemplaza_carga_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "inventario_carga.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    archivo_nombre_original: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    archivo_nombre_guardado: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    archivo_ruta: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    archivo_sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    archivo_tamano_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    estado: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'RECIBIDO'"),
    )

    total_registros: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    registros_validos: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    registros_invalidos: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    error_mensaje: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    recibido_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    procesado_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
