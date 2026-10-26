import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, sessionmaker


load_dotenv()


POSTGRES_SCHEMA = os.getenv("CYSN_POSTGRES_SCHEMA", "public").strip()
if not re.fullmatch(r"[a-z_][a-z0-9_]*", POSTGRES_SCHEMA):
    raise RuntimeError("CYSN_POSTGRES_SCHEMA debe ser un identificador PostgreSQL válido.")

DATABASE_URL = URL.create(
    drivername="postgresql+psycopg",
    username=os.getenv("DATABASE_USER"),
    password=os.getenv("DATABASE_PASSWORD"),
    host=os.getenv("DATABASE_HOST", "localhost"),
    port=int(os.getenv("DATABASE_PORT", "5432")),
    database=os.getenv("DATABASE_NAME"),
)


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={
        "options": f"-csearch_path={POSTGRES_SCHEMA},public",
    },
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return True
