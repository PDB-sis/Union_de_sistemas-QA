"""Instalador del agente (agente_tienda/instalador.py): configuración, claves y permisos por tipo de sitio."""
import importlib.util
import re
from pathlib import Path

import pytest

from app.agentes import codigo_desde_nombre, generar_token

RAIZ = Path(__file__).resolve().parents[3]
AGENTE = RAIZ / "agente_tienda"


@pytest.fixture(scope="module")
def instalador():
    spec = importlib.util.spec_from_file_location("instalador_agente", AGENTE / "instalador.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def tablas_de(sql: str) -> set[str]:
    return {t.upper() for t in re.findall(r"(?:FROM|JOIN)\s+(?:\[?\w+\]?\.)?\[?dbo\]?\.\[?(\w+)\]?", sql, re.I)}


def test_cada_perfil_tiene_select_sobre_todo_lo_que_leen_sus_consultas(instalador):
    agente = (AGENTE / "qa_agent.py").read_text(encoding="utf-8")
    consulta_inventario = agente.split('QUERY = """', 1)[1].split('"""', 1)[0]
    por_tarea = {"inventario": tablas_de(consulta_inventario)}
    for archivo in (AGENTE / "consultas").glob("*.sql"):
        por_tarea[archivo.stem] = tablas_de(archivo.read_text(encoding="utf-8-sig"))
    for base, perfil in instalador.PERFILES.items():
        necesarias = set().union(*(por_tarea[t] for t in perfil["tareas"].split(",")))
        assert necesarias <= set(perfil["tablas"]), (base, necesarias - set(perfil["tablas"]))


def test_tienda_solo_recibe_las_tablas_del_inventario(instalador):
    assert set(instalador.PERFILES["BD_SPDV"]["tablas"]) == {"INVENTARIO", "MARCAS", "CATEGORIAS", "TASA_CAMBIO", "PARAMETROS"}
    assert instalador.PERFILES["BD_SPDV"]["tareas"] == "inventario"


def test_clave_aleatoria_es_segura_para_sql_y_odbc(instalador):
    claves = {instalador.clave_aleatoria() for _ in range(200)}
    assert len(claves) == 200
    for clave in claves:
        assert len(clave) == 32 and clave.isalnum() and clave.isascii()
        assert any(c.islower() for c in clave) and any(c.isupper() for c in clave) and any(c.isdigit() for c in clave)


@pytest.mark.parametrize("base", ["BD_SPDV", "GDC_CASA_MATRIZ", "CREACION"])
def test_config_generada_la_lee_el_agente(instalador, base, tmp_path):
    token, clave = generar_token(), instalador.clave_aleatoria()
    path = tmp_path / "config.env"
    path.write_text(instalador.generar_config("https://api", "AGT-X", token, r"PC\SQLEXPRESS", base, clave), encoding="utf-8")
    valores = instalador.leer_config(path)
    perfil = instalador.PERFILES[base]
    assert valores["AGENT_TOKEN"] == token and valores["SQL_PASSWORD"] == clave
    assert valores["SQL_USER"] == "nexoqa_agente" and valores["SQL_DATABASE"] == base
    assert valores["SQL_SERVER"] == r"PC\SQLEXPRESS"
    assert valores["TAREAS"] == perfil["tareas"] and valores["SYNC_INTERVAL_SECONDS"] == str(perfil["intervalo"])


def test_acepta_codigos_y_tokens_del_servidor(instalador):
    codigo, token = instalador.validar_codigo_token(" " + codigo_desde_nombre("Plaza Lago").lower() + " ", generar_token() + "\n")
    assert codigo == "AGT-PLAZA-LAGO" and len(token) >= 32


@pytest.mark.parametrize(("codigo", "token"), [("AGT PLAZA", "x" * 43), ("AGT-X", "corto"), ("AGT-X", "x" * 40 + " y")])
def test_rechaza_codigos_y_tokens_mal_copiados(instalador, codigo, token):
    with pytest.raises(instalador.InstalacionError):
        instalador.validar_codigo_token(codigo, token)


def test_no_importa_modulos_de_windows_al_cargarse(instalador):
    assert "winreg" not in instalador.__dict__ and "pyodbc" not in instalador.__dict__
