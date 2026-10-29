"""Tareas de PDMC del agente de bodega: transferencias, devoluciones y usuarios (fase 3a)."""
import importlib.util
import sys
import types
from decimal import Decimal
from pathlib import Path

import pytest

from app.routers.agente_filas import FilaAgente, hash_datos

RAIZ = Path(__file__).resolve().parents[3]
AGENTE = RAIZ / "agente_tienda" / "qa_agent.py"
CONSULTAS = RAIZ / "agente_tienda" / "consultas"
ORIGINALES = RAIZ.parent / "consultaPDMC"


@pytest.fixture(scope="module")
def qa_agent():
    sys.modules.setdefault("pyodbc", types.ModuleType("pyodbc"))
    spec = importlib.util.spec_from_file_location("qa_agent_tareas", AGENTE)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class Bodega:
    """run_tarea / ciclo con SQL Server y la API simulados."""

    def __init__(self, qa_agent, monkeypatch, tmp_path):
        self.qa_agent, self.origen, self.lotes, self.latidos = qa_agent, {}, [], []
        self.falla = set()
        self.config = {"STATE_PATH": str(tmp_path / "estado.sqlite3"), "FULL_RECONCILIATION_HOURS": "24",
                       "TAREAS": "transferencias,devoluciones,usuarios"}
        monkeypatch.setattr(qa_agent, "task_rows", self._leer)
        monkeypatch.setattr(qa_agent, "post", self._post)

    def transferencia(self, numero, codigo, caja="1", cantidad="5", estado="Abierta"):
        clave = "\x1f".join([numero, codigo, caja])
        self.origen.setdefault("transferencias", {})[clave] = {
            "Numero": numero, "CodigoBarra": codigo, "NumeroCaja": caja, "Cantidad": cantidad, "status": estado}

    def _leer(self, _c, tarea):
        if tarea in self.falla:
            raise RuntimeError(f"sin permiso sobre {tarea}")
        return [{"clave": k, "datos": dict(d), "fila_hash": self.qa_agent.fingerprint(d)} for k, d in self.origen.get(tarea, {}).items()]

    def _post(self, _c, ruta, cuerpo):
        if ruta == "/api/agente/v1/latido":
            self.latidos.append(cuerpo)
            return {}
        assert ruta == "/api/agente/v1/filas"
        self.lotes.append(cuerpo)
        return {"insertadas_o_actualizadas": sum(not f.get("eliminada") for f in cuerpo["filas"]),
                "eliminadas": sum(bool(f.get("eliminada")) for f in cuerpo["filas"])}

    def vuelta(self, tarea="transferencias"):
        self.lotes.clear(); self.latidos.clear()
        return self.qa_agent.run_tarea(self.config, tarea)

    def filas(self):
        return [f for lote in self.lotes for f in lote["filas"]]


@pytest.fixture
def bodega(qa_agent, monkeypatch, tmp_path):
    return Bodega(qa_agent, monkeypatch, tmp_path)


def test_primera_vez_envia_todo_con_fotografia(bodega):
    bodega.transferencia("T1", "A"); bodega.transferencia("T1", "B", caja="2"); bodega.transferencia("T2", "A")
    r = bodega.vuelta()
    assert r["modo"] == "INICIAL" and r["enviadas"] == 3 and r["bajas"] == 0
    assert bodega.lotes[-1]["es_ultimo_lote"] and bodega.lotes[-1]["snapshot_id"] and bodega.lotes[-1]["tarea"] == "transferencias"


def test_sin_cambios_no_envia(bodega):
    bodega.transferencia("T1", "A"); bodega.vuelta()
    assert bodega.vuelta() == {"filas": 1, "enviadas": 0, "bajas": 0, "modo": "INCREMENTAL"}
    assert bodega.lotes == []


def test_solo_envia_lo_cambiado(bodega):
    bodega.transferencia("T1", "A"); bodega.transferencia("T2", "A"); bodega.vuelta()
    bodega.transferencia("T2", "A", estado="Exportada")
    r = bodega.vuelta()
    assert r["enviadas"] == 1 and [f["datos"]["Numero"] for f in bodega.filas()] == ["T2"]
    assert bodega.lotes[0]["snapshot_id"] is None


def test_lo_que_desaparece_se_envia_como_baja_al_momento(bodega):
    bodega.transferencia("T1", "A"); bodega.transferencia("T1", "B"); bodega.vuelta()
    del bodega.origen["transferencias"]["T1\x1fB\x1f1"]
    r = bodega.vuelta()
    assert r["bajas"] == 1 and bodega.filas() == [{"clave": "T1\x1fB\x1f1", "eliminada": True}]
    assert bodega.vuelta()["bajas"] == 0  # la baja se informa una sola vez


def test_consulta_vacia_no_da_de_baja_todo(bodega):
    bodega.transferencia("T1", "A"); bodega.vuelta()
    bodega.origen["transferencias"].clear()
    r = bodega.vuelta()
    assert r["filas"] == 0 and r["bajas"] == 0 and bodega.lotes == []


def test_reconciliacion_cada_24_horas(bodega, qa_agent):
    bodega.transferencia("T1", "A"); bodega.vuelta()
    qa_agent.put(qa_agent.state(bodega.config), "last_full:transferencias", "2000-01-01T00:00:00+00:00")
    r = bodega.vuelta()
    assert r["modo"] == "RECONCILIACION" and r["enviadas"] == 1 and bodega.lotes[0]["snapshot_id"]


def test_si_falla_a_mitad_solo_reenvia_lo_pendiente(bodega, qa_agent, monkeypatch):
    monkeypatch.setattr(qa_agent, "BATCH", 2)
    for n in ("T1", "T2", "T3", "T4"):
        bodega.transferencia(n, "A")
    bodega.vuelta()
    for n in ("T1", "T2", "T3", "T4"):
        bodega.transferencia(n, "A", cantidad="9")
    original = bodega._post

    def falla_segundo(c, ruta, cuerpo, llamadas=[]):
        llamadas.append(1)
        if len(llamadas) == 2:
            raise RuntimeError("sin Internet")
        return original(c, ruta, cuerpo)

    monkeypatch.setattr(qa_agent, "post", falla_segundo)
    with pytest.raises(RuntimeError):
        bodega.vuelta()
    monkeypatch.setattr(qa_agent, "post", original)
    bodega.vuelta()
    assert sorted(f["datos"]["Numero"] for f in bodega.filas()) == ["T3", "T4"]


def test_tareas_independientes_y_estado_separado(bodega):
    bodega.transferencia("T1", "A")
    bodega.origen["usuarios"] = {"U1": {"CodUsuario": "U1", "NombreUsuario": "ANA"}}
    bodega.vuelta("transferencias"); bodega.vuelta("usuarios")
    assert bodega.vuelta("usuarios")["enviadas"] == 0 and bodega.vuelta("transferencias")["enviadas"] == 0


def test_ciclo_sigue_si_una_tarea_falla_y_manda_latido(bodega, qa_agent):
    bodega.transferencia("T1", "A"); bodega.vuelta()
    bodega.falla.add("devoluciones")
    bodega.lotes.clear()
    r = qa_agent.ciclo(bodega.config)
    assert "sin permiso" in r["devoluciones"]["error"]
    assert r["transferencias"]["enviadas"] == 0 and r["usuarios"]["filas"] == 0
    # Sin inventario y sin envíos, el agente avisa de que sigue vivo.
    assert r["latido"] is True and len(bodega.latidos) == 1


def test_ciclo_con_inventario_no_duplica_latido(bodega, qa_agent, monkeypatch):
    monkeypatch.setattr(qa_agent, "run_once", lambda c: {"filas": 1, "enviadas": 0, "modo": "INCREMENTAL", "latido": True})
    r = qa_agent.ciclo({**bodega.config, "TAREAS": "inventario,usuarios"})
    assert "latido" not in r and r["inventario"]["latido"] is True


@pytest.mark.parametrize(("valor", "esperado"), [
    (None, ["inventario"]), ("inventario", ["inventario"]),
    (" Inventario , transferencias,transferencias ", ["inventario", "transferencias"]),
])
def test_tareas_configuradas(qa_agent, valor, esperado):
    c = {} if valor is None else {"TAREAS": valor}
    assert qa_agent.tareas(c) == esperado


def test_tarea_desconocida_falla(qa_agent):
    with pytest.raises(RuntimeError, match="TAREAS desconocidas"):
        qa_agent.tareas({"TAREAS": "inventario,ventas"})


@pytest.mark.parametrize("archivo", ["transferencias.sql", "devoluciones.sql", "usuarios.sql"])
def test_consultas_reales_son_de_solo_lectura(qa_agent, archivo):
    qa_agent.assert_read_only((CONSULTAS / archivo).read_text(encoding="utf-8-sig"))


@pytest.mark.parametrize("sql", [
    "INSERT INTO X VALUES (1)", "SELECT 1; DELETE FROM X", "SELECT * INTO copia FROM X", "EXEC sp_who",
])
def test_rechaza_consultas_que_escriben(qa_agent, sql):
    with pytest.raises(RuntimeError):
        qa_agent.assert_read_only(sql)


@pytest.mark.parametrize(("original", "copia"), [
    ("TRANSFERENCIAS NUEVAS.sql", "transferencias.sql"), ("DEVOLUCIONES.sql", "devoluciones.sql"),
    ("Usuarios Activos.sql", "usuarios.sql"),
])
def test_consultas_son_copias_exactas_de_consultapdmc(original, copia):
    if not ORIGINALES.exists():
        pytest.skip("consultaPDMC/ no está junto a CYSN_QA")
    assert (CONSULTAS / copia).read_bytes() == (ORIGINALES / original).read_bytes()


def test_consulta_creacion_es_copia_exacta_del_worker():
    worker = Path(__file__).resolve().parents[2] / "app" / "sync" / "sql" / "creacion_origen.sql"
    assert (CONSULTAS / "creacion.sql").read_bytes() == worker.read_bytes()


def test_tarea_creacion_por_codigo_barra_y_de_solo_lectura(qa_agent):
    assert qa_agent.tareas({"TAREAS": "creacion"}) == ["creacion"]
    assert qa_agent.TAREAS["creacion"] == ("creacion.sql", ("CodigoBarra",))
    # Empieza con comentarios y ";WITH": se acepta, pero sigue rechazando una segunda instrucción.
    qa_agent.assert_read_only((CONSULTAS / "creacion.sql").read_text(encoding="utf-8-sig"))
    with pytest.raises(RuntimeError):
        qa_agent.assert_read_only(";WITH x AS (SELECT 1 AS a) SELECT a FROM x; DELETE FROM INVENTARIO")


def test_consulta_se_busca_junto_a_config(qa_agent, tmp_path):
    (tmp_path / "consultas").mkdir()
    (tmp_path / "consultas" / "usuarios.sql").write_text("﻿SELECT CodUsuario, NombreUsuario FROM USUARIOS", encoding="utf-8")
    assert qa_agent.consulta({"_CONFIG_DIR": str(tmp_path)}, "usuarios").startswith("SELECT")
    with pytest.raises(RuntimeError, match="Falta la consulta"):
        qa_agent.consulta({"_CONFIG_DIR": str(tmp_path)}, "devoluciones")


def test_lectura_arma_clave_omite_vacias_y_repetidas(qa_agent, monkeypatch, tmp_path):
    columnas = ["Numero", "fecha_formateada", "CodigoBarra", "Cantidad", "NumeroCaja", "status"]
    filas = [("T1", "10/01/2026", "A ", Decimal("5.000"), 1, "Abierta"),
             (None, "10/01/2026", "B", Decimal("1"), 1, "Abierta"),
             ("T1", "10/01/2026", "A", Decimal("7"), 1, "Abierta")]

    class Cursor:
        description = [(c,) for c in columnas]
        def execute(self, sql): self.sql = sql
        def fetchall(self): return filas

    class Conexion:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(qa_agent, "connect", lambda _c: Conexion())
    monkeypatch.setattr(qa_agent, "consulta", lambda _c, _t: "SELECT 1")
    filas_leidas = qa_agent.task_rows({}, "transferencias")
    assert [f["clave"] for f in filas_leidas] == ["T1\x1fA\x1f1"]
    datos = filas_leidas[0]["datos"]
    assert datos == {"Numero": "T1", "fecha_formateada": "10/01/2026", "CodigoBarra": "A", "Cantidad": "7", "NumeroCaja": "1", "status": "Abierta"}
    # La API calcula la misma huella que el agente.
    assert hash_datos(datos) == filas_leidas[0]["fila_hash"]


def test_api_valida_filas():
    assert FilaAgente(clave="T1", eliminada=True).datos is None
    with pytest.raises(ValueError):
        FilaAgente(clave="T1")
    with pytest.raises(ValueError):
        FilaAgente(clave="   ", datos={"a": "b"})
    with pytest.raises(ValueError):
        FilaAgente(clave="T1", datos={f"c{i}": "x" for i in range(61)})
