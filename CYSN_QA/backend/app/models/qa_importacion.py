from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


qa_estado_importacion_enum = ENUM(
    "PENDIENTE",
    "IMPORTANDO",
    "COMPLETADA",
    "ERROR",
    name="qa_estado_importacion",
    create_type=False,
)


class QAImportacion(Base):
    __tablename__ = "qa_importacion"

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

    nombre_archivo: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
    )

    sha256: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    tamano_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    codificacion: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    delimitador: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
    )

    total_registros: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    estado: Mapped[str] = mapped_column(
        qa_estado_importacion_enum,
        nullable=False,
        server_default=text("'PENDIENTE'"),
    )

    mensaje_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    fecha_fin: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )