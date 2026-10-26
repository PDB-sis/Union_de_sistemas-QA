from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import ENUM

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from app.db.database import Base


# ============================================================
# ENUM EXISTENTE EN POSTGRESQL
# ============================================================
#
# IMPORTANTE:
# Este tipo YA existe físicamente en PostgreSQL.
#
# create_type=False evita que SQLAlchemy intente crearlo otra vez.
# ============================================================

QA_ESTADO_CORRECCION = ENUM(
    "PENDIENTE",
    "CORREGIDO",
    name="qa_estado_correccion",
    create_type=False,
)


# ============================================================
# MODELO QA_CORRECCION
# ============================================================

class QACorreccion(
    Base
):
    __tablename__ = "qa_correccion"


    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )


    qa_diferencia_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "qa_diferencia.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )


    estado_anterior: Mapped[str] = mapped_column(
        QA_ESTADO_CORRECCION,
        nullable=False,
    )


    estado_nuevo: Mapped[str] = mapped_column(
        QA_ESTADO_CORRECCION,
        nullable=False,
    )


    usuario: Mapped[str | None] = mapped_column(
        String(180),
        nullable=True,
    )


    observacion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


    created_at: Mapped[datetime] = mapped_column(
        DateTime(
            timezone=True
        ),
        nullable=False,
        server_default=func.now(),
    )