"""Tipos de las filas que envía el agente de tienda y que recibe la API."""
import importlib.util
import sys
import types
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.routers.agente_tienda import InventarioAgenteFila, _hash_fila


AGENTE = Path(__file__).resolve().parents[3] / "agente_tienda" / "qa_agent.py"


@pytest.fixture(scope="module")
def qa_agent():
    # El agente importa pyodbc al cargar; las pruebas no se conectan a SQL Server.
    sys.modules.setdefault("pyodbc", types.ModuleType("pyodbc"))
    spec = importlib.util.spec_from_file_location("qa_agent", AGENTE)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def fila_sql_server(**cambios):
    """Fila como la entrega pyodbc: códigos numéricos, BIT como bool y montos Decimal."""
    base = {
        "tasa_cambio": Decimal("36.500000"),
        "fecha_tasa_cambio": datetime(2026, 10, 8, 8, 0),
        "sucursal_origen": "SUCURSAL CENTRO",
        "codigo_barra": "7591234567890",
        "referencia": "REF-01",
        "codigo_marca": 12,
        "concatenado": "REF-0112",
        "marca": "MARCA",
        "descripcion": "PRODUCTO",
        "codigo_categoria": 3,
        "nombre_categoria": "CATEGORIA",
        "status": True,
        "existencia": Decimal("10.000"),
        "costo_dolar": Decimal("1.5000"),
        "costo_inicial": Decimal("50.0000"),
        "precio_promocion": Decimal("0.0000"),
        "precio_detal_usd_mas_iva": Decimal("2.32"),
        "precio_detal_mas_iva": Decimal("84.68"),
        "precio_mayor_usd_mas_iva": Decimal("2.00"),
        "precio_mayor_mas_iva": Decimal("73.00"),
        "origen_actualizado_at": datetime(2026, 10, 19, 9, 30),
    }
    base.update(cambios)
    return base


@pytest.mark.parametrize(
    ("status", "activo"),
    [(True, True), (False, False), (1, True), (0, False), ("1", True), ("0", False), (None, False)],
)
def test_activo_segun_status(qa_agent, status, activo):
    fila = qa_agent.normalize(fila_sql_server(status=status))
    assert fila["activo"] is activo


def test_agente_envia_codigos_y_status_como_texto(qa_agent):
    fila = qa_agent.normalize(fila_sql_server())
    assert fila["codigo_marca"] == "12"
    assert fila["codigo_categoria"] == "3"
    assert fila["status"] == "true"


def test_api_acepta_fila_normalizada_por_el_agente(qa_agent):
    fila = qa_agent.normalize(fila_sql_server())
    fila["fila_hash"] = qa_agent.fingerprint(fila)
    modelo = InventarioAgenteFila.model_validate(fila)
    assert modelo.codigo_marca == "12"
    assert modelo.activo is True
    assert len(_hash_fila(modelo)) == 64


def test_agente_envia_linea_como_texto(qa_agent):
    fila = qa_agent.normalize(fila_sql_server(linea="DAMA"))
    fila["fila_hash"] = qa_agent.fingerprint(fila)
    assert InventarioAgenteFila.model_validate(fila).linea == "DAMA"
    assert "CL.Nombre AS linea" in qa_agent.QUERY and "LEFT(C.Codigo,4)=CL.Codigo" in qa_agent.QUERY


def test_huella_sin_linea_no_cambia_para_agentes_anteriores():
    # Sin línea, el servidor calcula la misma huella que antes de existir el campo:
    # los agentes ya instalados no provocan una actualización masiva del inventario.
    import hashlib, json
    fila = InventarioAgenteFila.model_validate(fila_sql_server(fila_hash="0" * 64))
    anterior = fila.model_dump(mode="json")
    anterior.pop("fila_hash"); anterior.pop("linea")
    esperado = hashlib.sha256(json.dumps(anterior, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    assert _hash_fila(fila) == esperado
    con_linea = InventarioAgenteFila.model_validate(fila_sql_server(fila_hash="0" * 64, linea="DAMA"))
    assert _hash_fila(con_linea) != esperado


def test_api_acepta_tipos_sin_normalizar_de_agentes_ya_compilados():
    fila = fila_sql_server(fila_hash="0" * 64, activo=True)
    modelo = InventarioAgenteFila.model_validate(fila)
    assert modelo.codigo_marca == "12"
    assert modelo.codigo_categoria == "3"
    assert modelo.status == "true"


class ErrorOdbc(Exception):
    pass


def config_sql(**cambios):
    base = {"SQL_SERVER": r"SERVERSQL\SQL2005", "SQL_USER": "u", "SQL_PASSWORD": "p"}
    base.update(cambios)
    return base


@pytest.mark.parametrize(
    ("instalados", "esperado"),
    [
        (["SQL Server", "ODBC Driver 17 for SQL Server"], "ODBC Driver 17 for SQL Server"),
        (["SQL Server", "ODBC Driver 17 for SQL Server", "ODBC Driver 18 for SQL Server"], "ODBC Driver 18 for SQL Server"),
        (["SQL Server"], "SQL Server"),
    ],
)
def test_driver_auto_elige_el_mas_moderno_instalado(qa_agent, monkeypatch, instalados, esperado):
    monkeypatch.setattr(qa_agent.pyodbc, "drivers", lambda: instalados, raising=False)
    assert qa_agent.driver(config_sql()) == esperado
    assert qa_agent.driver(config_sql(SQL_DRIVER="auto")) == esperado


def test_driver_configurado_se_respeta(qa_agent, monkeypatch):
    monkeypatch.setattr(qa_agent.pyodbc, "drivers", lambda: ["SQL Server"], raising=False)
    assert qa_agent.driver(config_sql(SQL_DRIVER="ODBC Driver 17 for SQL Server")) == "ODBC Driver 17 for SQL Server"


def test_driver_auto_sin_drivers_falla_con_mensaje(qa_agent, monkeypatch):
    monkeypatch.setattr(qa_agent.pyodbc, "drivers", lambda: ["Microsoft Access Driver (*.mdb)"], raising=False)
    with pytest.raises(RuntimeError, match="No hay driver ODBC"):
        qa_agent.driver(config_sql())


def test_encrypt_auto_reintenta_sin_cifrado_solo_si_falla_tls(qa_agent, monkeypatch):
    cadenas = []

    def conectar(cadena, **_):
        cadenas.append(cadena)
        if "Encrypt=yes" in cadena:
            raise ErrorOdbc("[08001] SSL Provider: The certificate chain was issued by an authority that is not trusted.")
        return "conexion"

    monkeypatch.setattr(qa_agent.pyodbc, "Error", ErrorOdbc, raising=False)
    monkeypatch.setattr(qa_agent.pyodbc, "connect", conectar, raising=False)
    assert qa_agent.connect(config_sql(SQL_DRIVER="SQL Server")) == "conexion"
    assert ["Encrypt=yes" in x for x in cadenas] == [True, False]


def test_encrypt_auto_no_reintenta_si_falla_el_login(qa_agent, monkeypatch):
    def conectar(cadena, **_):
        raise ErrorOdbc("[28000] Login failed for user 'u'.")

    monkeypatch.setattr(qa_agent.pyodbc, "Error", ErrorOdbc, raising=False)
    monkeypatch.setattr(qa_agent.pyodbc, "connect", conectar, raising=False)
    with pytest.raises(ErrorOdbc, match="Login failed"):
        qa_agent.connect(config_sql(SQL_DRIVER="SQL Server"))


def test_fechas_de_sql_server_llevan_zona_horaria_local(qa_agent):
    fila = qa_agent.normalize(fila_sql_server())
    assert fila["origen_actualizado_at"].utcoffset() == datetime.now().astimezone().utcoffset()
    assert fila["fecha_tasa_cambio"].tzinfo is not None


class AgenteSimulado:
    """Ejecuta run_once con SQL Server y la API simulados."""

    def __init__(self, qa_agent, monkeypatch, tmp_path):
        self.qa_agent = qa_agent
        self.origen = {}
        self.lotes = []
        self.latidos = []
        self.falla_en_lote = None
        self.falla_latido = False
        self.config = {"STATE_PATH": str(tmp_path / "estado.sqlite3"), "FULL_RECONCILIATION_HOURS": "24"}
        monkeypatch.setattr(qa_agent, "sql", self._leer)
        monkeypatch.setattr(qa_agent, "post", self._post)

    def producto(self, codigo, existencia="10", status=1):
        self.origen[codigo] = fila_sql_server(codigo_barra=codigo, existencia=Decimal(existencia), status=status)

    def _leer(self, _config):
        filas = []
        for base in self.origen.values():
            fila = self.qa_agent.normalize(dict(base))
            fila["fila_hash"] = self.qa_agent.fingerprint(fila)
            filas.append(fila)
        return filas

    def _post(self, _config, ruta, cuerpo):
        if ruta == "/api/agente/v1/latido":
            if self.falla_latido:
                raise RuntimeError("API HTTP 404: Not Found")
            self.latidos.append(cuerpo)
            return {"sucursal_id": 1, "ultimo_contacto_at": "2026-10-21T12:00:00+00:00"}
        assert ruta == "/api/agente/v1/inventario/sincronizaciones"
        if self.falla_en_lote is not None and len(self.lotes) == self.falla_en_lote:
            raise RuntimeError("sin Internet")
        self.lotes.append(cuerpo)
        return {"insertadas_o_actualizadas": len(cuerpo["filas"])}

    def ciclo(self):
        self.lotes.clear()
        self.latidos.clear()
        return self.qa_agent.run_once(self.config)

    def codigos_enviados(self):
        return sorted(f["codigo_barra"] for lote in self.lotes for f in lote["filas"])


@pytest.fixture
def agente(qa_agent, monkeypatch, tmp_path):
    return AgenteSimulado(qa_agent, monkeypatch, tmp_path)


def test_primera_vez_envia_solo_activos_con_snapshot(agente):
    agente.producto("1001"); agente.producto("1002"); agente.producto("1003", status=0)
    resultado = agente.ciclo()
    assert resultado["modo"] == "INICIAL"
    assert agente.codigos_enviados() == ["1001", "1002"]
    assert agente.lotes[-1]["es_ultimo_lote"] is True and agente.lotes[-1]["snapshot_id"]


def test_sin_cambios_no_envia_inventario_solo_latido(agente):
    agente.producto("1001"); agente.ciclo()
    resultado = agente.ciclo()
    assert resultado == {"filas": 1, "enviadas": 0, "modo": "INCREMENTAL", "latido": True}
    assert agente.lotes == []
    assert len(agente.latidos) == 1


def test_con_cambios_no_envia_latido(agente):
    # El propio envío actualiza ultimo_contacto_at en la API.
    agente.producto("1001")
    agente.ciclo()
    assert agente.lotes and agente.latidos == []


def test_latido_fallido_no_detiene_el_ciclo(agente):
    # Ej.: agente nuevo contra una API anterior que aún no tiene /latido.
    agente.producto("1001"); agente.ciclo()
    agente.falla_latido = True
    resultado = agente.ciclo()
    assert resultado["latido"] is False and resultado["enviadas"] == 0


def test_cambio_de_existencia_se_envia_aunque_no_cambie_la_fecha(agente):
    agente.producto("1001"); agente.producto("1002"); agente.ciclo()
    agente.producto("1002", existencia="9")  # venta: UltimaActualizacion no cambia
    resultado = agente.ciclo()
    assert resultado["modo"] == "INCREMENTAL"
    assert agente.codigos_enviados() == ["1002"]
    assert agente.lotes[0]["snapshot_id"] is None


def test_producto_que_pasa_a_inactivo_se_informa_una_sola_vez(agente):
    agente.producto("1001"); agente.ciclo()
    agente.producto("1001", status=0)
    agente.ciclo()
    assert agente.codigos_enviados() == ["1001"]
    assert agente.lotes[0]["filas"][0]["activo"] is False
    agente.ciclo()
    assert agente.lotes == []


def test_inactivo_nunca_enviado_no_se_envia(agente):
    agente.producto("1001"); agente.ciclo()
    agente.producto("1009", status=0)
    agente.ciclo()
    assert agente.lotes == []


def test_si_falla_a_mitad_solo_reenvia_lo_pendiente(agente, qa_agent, monkeypatch):
    monkeypatch.setattr(qa_agent, "BATCH", 2)
    for codigo in ("1001", "1002", "1003", "1004"):
        agente.producto(codigo)
    agente.ciclo()
    for codigo in ("1001", "1002", "1003", "1004"):
        agente.producto(codigo, existencia="5")
    agente.falla_en_lote = 1
    with pytest.raises(RuntimeError):
        agente.ciclo()
    agente.falla_en_lote = None
    agente.ciclo()
    assert agente.codigos_enviados() == ["1003", "1004"]


def test_reconciliacion_cada_24_horas_reenvia_activos(agente, qa_agent):
    agente.producto("1001"); agente.producto("1002", status=0)
    agente.ciclo()
    db = qa_agent.state(agente.config)
    qa_agent.put(db, "last_full", "2000-01-01T00:00:00+00:00")
    resultado = agente.ciclo()
    assert resultado["modo"] == "RECONCILIACION"
    assert agente.codigos_enviados() == ["1001"]


def test_estado_antiguo_sin_huellas_fuerza_reconciliacion(agente, qa_agent):
    db = qa_agent.state(agente.config)
    qa_agent.put(db, "last_full", datetime.now().astimezone().isoformat())
    agente.producto("1001")
    assert agente.ciclo()["modo"] == "RECONCILIACION"


def test_reconciliacion_sin_activos_no_envia(agente):
    agente.producto("1001", status=0)
    resultado = agente.ciclo()
    assert resultado["enviadas"] == 0 and agente.lotes == []
    assert len(agente.latidos) == 1  # el agente sigue vivo aunque no reconcilie


def test_lectura_omite_codigos_vacios_y_repetidos(qa_agent, monkeypatch):
    filas = [fila_sql_server(codigo_barra=c, existencia=Decimal(e)) for c, e in
             [("1001", "1"), ("  ", "2"), (None, "3"), ("1002 ", "4"), ("1001", "5")]]
    columnas = list(filas[0].keys())

    class Cursor:
        description = [(c,) for c in columnas]
        def execute(self, consulta): self.consulta = consulta
        def fetchall(self): return [tuple(f[c] for c in columnas) for f in filas]

    class Conexion:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(qa_agent, "connect", lambda _c: Conexion())
    leidas = {f["codigo_barra"]: f for f in qa_agent.sql({})}
    assert sorted(leidas) == ["1001", "1002"]
    assert leidas["1001"]["existencia"] == Decimal("5")  # se conserva la última fila recibida


def test_api_rechaza_codigo_barra_vacio():
    with pytest.raises(ValidationError):
        InventarioAgenteFila.model_validate(fila_sql_server(codigo_barra="  ", fila_hash="0" * 64))
