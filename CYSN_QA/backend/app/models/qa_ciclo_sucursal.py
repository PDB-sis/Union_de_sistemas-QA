from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class QACicloSucursal(Base):
    __tablename__ = "qa_ciclo_sucursal"

    __table_args__ = (
        UniqueConstraint(
            "qa_ciclo_id",
            "sucursal_id",
            name="uq_qa_ciclo_sucursal",
        ),
        CheckConstraint(
            "estado_recepcion IN ('PENDIENTE','RECIBIDO','VALIDADO','RECHAZADO')",
            name="ck_qa_ciclo_sucursal_estado",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    qa_ciclo_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_ciclo.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    sucursal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "sucursal.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    estado_recepcion: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'PENDIENTE'"),
    )

    recibido_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    validado_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    observacion: Mapped[str | None] = mapped_column(
        Text,
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
