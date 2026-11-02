"""Alta masiva de agentes: un agente por cada tienda y bodega activa del catálogo que no tenga.

La parte de base de datos requiere una base DESCARTABLE cuyo nombre contenga "test":
set CYSN_TEST_DATABASE_URL=postgresql+psycopg://usuario:clave@127.0.0.1:5432/cysn_qa_test
Crea las tablas mínimas en public y un esquema PDMC de prueba (pdmc_prueba).
"""
from __future__ import annotations

import csv
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.agentes import AgenteError, codigos_unicos, crear_faltantes
from app.security import hash_token_agente

URL = os.getenv("CYSN_TEST_DATABASE_URL")
ESQUEMA = "pdmc_prueba"


def test_codigos_unicos_repetidos_llevan_el_dimid():
    sitios = [{"sitio": "Plaza Lago", "dim_id_tienda": 1}, {"sitio": "plaza lago", "dim_id_tienda": 2},
              {"sitio": "Galerias", "dim_id_tienda": 3}]
    assert codigos_unicos(sitios, {"AGT-GALERIAS"}) == ["AGT-PLAZA-LAGO", "AGT-PLAZA-LAGO-2", "AGT-GALERIAS-3"]


DDL = f"""
DROP TABLE IF EXISTS agente_sucursal, sucursal CASCADE;
DROP SCHEMA IF EXISTS {ESQUEMA} CASCADE;
CREATE TABLE sucursal (id BIGSERIAL PRIMARY KEY, nombre TEXT NOT NULL, dim_id_tienda INTEGER UNIQUE);
CREATE TABLE agente_sucursal (
    id BIGSERIAL PRIMARY KEY, sucursal_id BIGINT REFERENCES sucursal(id), dim_id_tienda INTEGER UNIQUE,
    codigo VARCHAR(80) NOT NULL UNIQUE, token_hash CHAR(64) NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_contacto_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    CHECK (sucursal_id IS NOT NULL OR dim_id_tienda IS NOT NULL));
CREATE SCHEMA {ESQUEMA};
CREATE TYPE {ESQUEMA}."TipoUbicacion" AS ENUM ('REGION', 'BODEGA', 'TIENDA');
CREATE TABLE {ESQUEMA}."Ubicacion" (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, tipo {ESQUEMA}."TipoUbicacion" NOT NULL, "dimIdTienda" INTEGER UNIQUE);
CREATE TABLE {ESQUEMA}."Tienda" (id TEXT PRIMARY KEY, activa BOOLEAN NOT NULL, "ubicacionId" TEXT NOT NULL UNIQUE);
CREATE TABLE {ESQUEMA}."Bodega" (id TEXT PRIMARY KEY, activa BOOLEAN NOT NULL, "ubicacionId" TEXT NOT NULL UNIQUE);
INSERT INTO {ESQUEMA}."Ubicacion" VALUES
  ('r', 'Sin región', 'REGION', NULL),
  ('t1', 'LIBERTAD', 'TIENDA', 1011),          -- ya tiene agente (por su sucursal)
  ('t2', 'PLAZA LAGO', 'TIENDA', 1020),        -- enlazada con una sucursal de CYSN
  ('t3', 'CERRADA', 'TIENDA', 1030),           -- inactiva
  ('t4', 'GALERIAS', 'TIENDA', 1040),          -- sin sucursal en CYSN
  ('b1', 'BODEGA MARACAIBO', 'BODEGA', 2004),  -- ya tiene agente (por dimID)
  ('b2', 'BODEGA ORIENTE', 'BODEGA', 2005),
  ('x', 'SIN DIM', 'TIENDA', NULL);
INSERT INTO {ESQUEMA}."Tienda" VALUES ('1', true, 't1'), ('2', true, 't2'), ('3', false, 't3'), ('4', true, 't4'), ('5', true, 'x');
INSERT INTO {ESQUEMA}."Bodega" VALUES ('1', true, 'b1'), ('2', true, 'b2');
INSERT INTO sucursal (id, nombre, dim_id_tienda) VALUES (10, 'libertad', 1011), (20, 'plaza lago', 1020);
INSERT INTO agente_sucursal (sucursal_id, codigo, token_hash) VALUES (10, 'AGT-LIBERTAD', repeat('a', 64));
INSERT INTO agente_sucursal (dim_id_tienda, codigo, token_hash) VALUES (2004, 'AGT-BODEGA-MARACAIBO', repeat('b', 64));
"""


@pytest.fixture()
def db():
    if not URL:
        pytest.skip("CYSN_TEST_DATABASE_URL no configurada")
    url = make_url(URL)
    assert url.database and "test" in url.database.lower(), "La base de prueba debe contener 'test' en su nombre."
    engine = create_engine(url, poolclass=NullPool)
    with engine.begin() as conn:
        conn.exec_driver_sql(DDL)
    with Session(engine) as sesion:
        yield sesion
    with engine.begin() as conn:
        conn.exec_driver_sql(f"DROP TABLE IF EXISTS agente_sucursal, sucursal CASCADE; DROP SCHEMA IF EXISTS {ESQUEMA} CASCADE;")
    engine.dispose()


def agentes(db):
    return db.execute(text("SELECT codigo, sucursal_id, dim_id_tienda, token_hash FROM agente_sucursal ORDER BY codigo")).all()


def test_sin_aplicar_solo_muestra(db, tmp_path, capsys):
    assert crear_faltantes(db, "todos", False, None, [], ESQUEMA) == 0
    salida = capsys.readouterr().out
    assert "AGT-PLAZA-LAGO" in salida and "AGT-GALERIAS" in salida and "AGT-BODEGA-ORIENTE" in salida
    assert "CERRADA" not in salida and "LIBERTAD" not in salida.split("CÓDIGO")[1]
    assert len(agentes(db)) == 2


def test_aplicar_crea_los_que_faltan_y_guarda_los_tokens(db, tmp_path):
    archivo = tmp_path / "tokens.csv"
    assert crear_faltantes(db, "todos", True, archivo, [], ESQUEMA) == 0
    with archivo.open(encoding="utf-8-sig", newline="") as f:
        filas = {r["codigo"]: r for r in csv.DictReader(f, delimiter=";")}
    assert set(filas) == {"AGT-BODEGA-ORIENTE", "AGT-GALERIAS", "AGT-PLAZA-LAGO"}
    assert filas["AGT-PLAZA-LAGO"]["sucursal_id"] == "20" and filas["AGT-GALERIAS"]["sucursal_id"] == ""
    guardados = {c: (s, d, h) for c, s, d, h in agentes(db)}
    assert guardados["AGT-PLAZA-LAGO"][:2] == (20, 1020)
    assert guardados["AGT-BODEGA-ORIENTE"][:2] == (None, 2005)
    for codigo, fila in filas.items():
        assert guardados[codigo][2] == hash_token_agente(fila["token"])  # en la base solo el hash
    # Una segunda vuelta no encuentra nada que crear.
    assert crear_faltantes(db, "todos", True, tmp_path / "otra.csv", [], ESQUEMA) == 0
    assert not (tmp_path / "otra.csv").exists()


def test_filtra_por_tipo_y_excluye(db, tmp_path):
    archivo = tmp_path / "tiendas.csv"
    assert crear_faltantes(db, "tienda", True, archivo, [1040], ESQUEMA) == 0
    assert [a[0] for a in agentes(db)] == ["AGT-BODEGA-MARACAIBO", "AGT-LIBERTAD", "AGT-PLAZA-LAGO"]


def test_aplicar_exige_archivo_nuevo(db, tmp_path):
    with pytest.raises(AgenteError):
        crear_faltantes(db, "todos", True, None, [], ESQUEMA)
    existente = tmp_path / "ya.csv"
    existente.write_text("no tocar", encoding="utf-8")
    with pytest.raises(AgenteError):
        crear_faltantes(db, "todos", True, existente, [], ESQUEMA)
    assert existente.read_text(encoding="utf-8") == "no tocar"
    assert len(agentes(db)) == 2


def test_si_falla_un_alta_no_queda_ninguna(db, tmp_path):
    # Un agente con el código que tocaría al segundo sitio, pero de otro dimID: choca el UNIQUE de codigo.
    db.execute(text("INSERT INTO agente_sucursal (dim_id_tienda, codigo, token_hash) VALUES (9999, 'AGT-GALERIAS-X', repeat('c', 64))"))
    db.execute(text(f"""UPDATE {ESQUEMA}."Ubicacion" SET nombre = 'GALERIAS X' WHERE id = 't4'"""))
    db.commit()
    from app import agentes as modulo
    original = modulo.codigos_unicos
    modulo.codigos_unicos = lambda sitios, ocupados: [f"AGT-GALERIAS-X" if s["dim_id_tienda"] == 1040 else original([s], set())[0] for s in sitios]
    try:
        with pytest.raises(AgenteError):
            crear_faltantes(db, "todos", True, tmp_path / "t.csv", [], ESQUEMA)
    finally:
        modulo.codigos_unicos = original
    assert len(agentes(db)) == 3
    assert not (tmp_path / "t.csv").exists()
