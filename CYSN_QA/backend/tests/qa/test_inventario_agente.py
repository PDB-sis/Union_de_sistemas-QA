"""
Pruebas de integración: el ciclo QA toma el inventario de cada sucursal desde su agente.

Requieren una base de datos DESCARTABLE cuyo nombre contenga "test" (la misma que
tests/sync): set CYSN_TEST_DATABASE_URL=postgresql+psycopg://usuario:clave@127.0.0.1:5432/cysn_qa_test
Recrean en public las tablas de los modelos de NEXO QA.
"""

from __future__ import annotations

import importlib
import os
import pkgutil
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

import app.models
from app.db.database import Base
from app.models.empresa import Empresa
from app.models.inventario_carga import InventarioCarga
from app.models.inventario_detalle import InventarioDetalle
from app.models.qa_ciclo import QACiclo
from app.models.qa_ciclo_sucursal import QACicloSucursal
from app.models.rol import Rol
from app.models.sucursal import Sucursal
from app.models.user import User
from app.services.inventario_agente_service import tomar_inventarios_pendientes


URL = os.getenv("CYSN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not URL, reason="CYSN_TEST_DATABASE_URL no configurada")

for modulo in pkgutil.iter_modules(app.models.__path__):
    importlib.import_module(f"app.models.{modulo.name}")

# Solo las tablas que usa el servicio (otras dependen de tipos ENUM que crean las migraciones).
TABLAS = [m.__table__ for m in (Rol, User, Empresa, Sucursal, QACiclo, QACicloSucursal, InventarioCarga, InventarioDetalle)]

DDL_AGENTE = """
ALTER TABLE sucursal ADD COLUMN dim_id_tienda INTEGER;
CREATE TABLE inventario_agente_actual (
    id BIGSERIAL PRIMARY KEY, sucursal_id BIGINT NULL, dim_id_tienda INTEGER NULL,
    codigo_barra VARCHAR(100) NOT NULL, referencia VARCHAR(180), codigo_marca VARCHAR(100),
    concatenado VARCHAR(255), marca VARCHAR(180), descripcion TEXT, codigo_categoria VARCHAR(100),
    nombre_categoria VARCHAR(180), status VARCHAR(100), existencia NUMERIC(18,2),
    tasa_cambio NUMERIC(18,6), fecha_tasa_cambio TIMESTAMPTZ, precio_promocion NUMERIC(18,4),
    costo_inicial NUMERIC(18,4), costo_dolar NUMERIC(18,4), precio_detal_usd_mas_iva NUMERIC(18,4),
    precio_detal_mas_iva NUMERIC(18,4), precio_mayor_usd_mas_iva NUMERIC(18,4),
    precio_mayor_mas_iva NUMERIC(18,4), activo BOOLEAN NOT NULL DEFAULT TRUE,
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


@pytest.fixture()
def db():
    url = make_url(URL)
    assert url.database and "test" in url.database.lower(), (
        "Por seguridad, CYSN_TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga 'test'."
    )
    engine = create_engine(url, poolclass=NullPool)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS inventario_agente_actual CASCADE")
        Base.metadata.drop_all(conn, tables=TABLAS)
        Base.metadata.create_all(conn, tables=TABLAS)
        conn.exec_driver_sql(DDL_AGENTE)
    with Session(engine) as sesion:
        yield sesion
    engine.dispose()


def _escenario(db, *, sucursales=("TIENDA NORTE",)):
    rol = Rol(nombre="ADMINISTRADOR")
    empresa = Empresa(nombre="EMPRESA")
    db.add_all([rol, empresa])
    db.flush()
    usuario = User(rol_id=rol.id, username="admin", nombre="Admin", password_hash="x")
    ciclo = QACiclo(nombre="Ciclo", fecha_inicio=date(2026, 10, 28))
    db.add_all([usuario, ciclo])
    db.flush()
    filas = []
    for nombre in sucursales:
        sucursal = Sucursal(empresa_id=empresa.id, nombre=nombre)
        db.add(sucursal)
        db.flush()
        participacion = QACicloSucursal(qa_ciclo_id=ciclo.id, sucursal_id=sucursal.id)
        db.add(participacion)
        db.flush()
        filas.append((sucursal, participacion))
    db.commit()
    return usuario, ciclo, filas


def _enviar(db, codigo, *, sucursal_id=None, dim=None, activo=True, existencia="5"):
    db.execute(
        text(
            """
            INSERT INTO inventario_agente_actual (sucursal_id, dim_id_tienda, codigo_barra, referencia,
                existencia, tasa_cambio, precio_detal_usd_mas_iva, status, activo)
            VALUES (:s, :d, :c, 'REF', :e, 36.5, 2.32, '1', :a)
            """
        ),
        {"s": sucursal_id, "d": dim, "c": codigo, "e": Decimal(existencia), "a": activo},
    )
    db.commit()


def test_toma_el_inventario_del_agente_de_cada_sucursal(db):
    usuario, ciclo, [(norte, p_norte), (sur, p_sur)] = _escenario(db, sucursales=("TIENDA NORTE", "TIENDA SUR"))
    _enviar(db, "111111111", sucursal_id=norte.id)
    _enviar(db, "222222222", sucursal_id=norte.id)
    _enviar(db, "333333333", sucursal_id=norte.id, activo=False)  # inactivo: no entra
    _enviar(db, "12345", sucursal_id=norte.id)  # código no válido: se ignora, como en el CSV
    db.execute(text("UPDATE sucursal SET dim_id_tienda = 1017 WHERE id = :id"), {"id": sur.id})
    _enviar(db, "444444444", dim=1017)  # agente enlazado por dimID_Tienda

    assert tomar_inventarios_pendientes(db, ciclo.id, usuario.id) == []
    db.commit()

    for participacion, codigos in ((p_norte, {"111111111", "222222222"}), (p_sur, {"444444444"})):
        db.refresh(participacion)
        assert participacion.estado_recepcion == "VALIDADO"
        carga = db.scalar(select(InventarioCarga).where(InventarioCarga.qa_ciclo_sucursal_id == participacion.id))
        assert (carga.estado, carga.es_actual, carga.version) == ("VALIDADO", True, 1)
        detalles = db.scalars(select(InventarioDetalle).where(InventarioDetalle.inventario_carga_id == carga.id)).all()
        assert {d.codigo_barra for d in detalles} == codigos
        assert all(d.existencia == Decimal("5") and d.precio_detal_usd_mas_iva == Decimal("2.32") for d in detalles)
    carga_norte = db.scalar(select(InventarioCarga).where(InventarioCarga.qa_ciclo_sucursal_id == p_norte.id))
    assert (carga_norte.total_registros, carga_norte.registros_validos, carga_norte.registros_invalidos) == (3, 2, 1)


def test_sucursal_sin_agente_se_informa(db):
    usuario, ciclo, [(norte, _), (sur, _)] = _escenario(db, sucursales=("TIENDA NORTE", "TIENDA SUR"))
    _enviar(db, "111111111", sucursal_id=norte.id)
    assert tomar_inventarios_pendientes(db, ciclo.id, usuario.id) == ["TIENDA SUR"]
    db.rollback()
    assert db.scalar(select(func.count(InventarioCarga.id))) == 0


def test_sucursal_ya_validada_no_se_toca(db):
    usuario, ciclo, [(norte, participacion)] = _escenario(db)
    participacion.estado_recepcion = "VALIDADO"
    db.commit()
    _enviar(db, "111111111", sucursal_id=norte.id)
    assert tomar_inventarios_pendientes(db, ciclo.id, usuario.id) == []
    assert db.scalar(select(func.count(InventarioCarga.id))) == 0
