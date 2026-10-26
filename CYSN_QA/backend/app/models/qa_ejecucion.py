from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


qa_estado_ejecucion_enum = ENUM(
    "PREPARANDO",
    "CARGANDO",
    "PROCESANDO",
    "COMPLETADA",
    "ERROR",
    "CERRADA",
    name="qa_estado_ejecucion",
    create_type=False,
)


class QAEjecucion(Base):
    __tablename__ = "qa_ejecucion"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    qa_ciclo_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_ciclo.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    nombre: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )

    fecha_referencia: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    estado: Mapped[str] = mapped_column(
        qa_estado_ejecucion_enum,
        nullable=False,
        server_default=text("'PREPARANDO'"),
    )

    descripcion: Mapped[str | None] = mapped_column(
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