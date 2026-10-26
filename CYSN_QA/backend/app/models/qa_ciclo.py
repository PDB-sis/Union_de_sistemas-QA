from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class QACiclo(Base):
    __tablename__ = "qa_ciclo"

    __table_args__ = (
        CheckConstraint(
            "estado IN ('PREPARANDO','RECEPCION','LISTO_QA','PROCESANDO','COMPLETADO','CERRADO')",
            name="ck_qa_ciclo_estado",
        ),
        CheckConstraint(
            "fecha_fin IS NULL OR fecha_fin >= fecha_inicio",
            name="ck_qa_ciclo_fechas",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    nombre: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )

    descripcion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    fecha_inicio: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    fecha_fin: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    estado: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'PREPARANDO'"),
    )

    creado_por_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "user.id",
            ondelete="SET NULL",
        ),
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
