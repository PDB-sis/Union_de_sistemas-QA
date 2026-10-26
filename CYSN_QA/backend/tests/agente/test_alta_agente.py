"""Alta de agentes: tokens, códigos y compatibilidad del hash con la API."""
import hashlib

import pytest

from app.agentes import AgenteError, codigo_desde_nombre, generar_token, validar_codigo
from app.routers.agente_tienda import router
from app.security import hash_token_agente


def test_token_cumple_lo_que_exige_la_api():
    tokens = {generar_token() for _ in range(50)}
    assert len(tokens) == 50
    for token in tokens:
        # Header X-Agente-Token: min_length=32, max_length=512; config.env sin comillas.
        assert 32 <= len(token) <= 512
        assert token.replace("-", "").replace("_", "").isalnum()


def test_hash_es_sha256_hexadecimal_del_token():
    token = "token-de-prueba-0123456789-abcdefghij"
    esperado = hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert hash_token_agente(token) == esperado
    assert len(hash_token_agente(token)) == 64  # agente_sucursal.token_hash CHAR(64)


def test_router_usa_el_mismo_hash():
    rutas = [r for r in router.routes if r.path.endswith("/inventario/sincronizaciones")]
    assert rutas
    assert rutas[0].endpoint.__globals__["hash_token_agente"] is hash_token_agente


@pytest.mark.parametrize(
    ("nombre", "codigo"),
    [
        ("galerias", "AGT-GALERIAS"),
        ("Divarius Chinita", "AGT-DIVARIUS-CHINITA"),
        ("  plaza   lago ", "AGT-PLAZA-LAGO"),
        ("Machiques (Centro)", "AGT-MACHIQUES-CENTRO"),
        ("Mérida Ñ", "AGT-MERIDA-N"),
    ],
)
def test_codigo_desde_nombre(nombre, codigo):
    assert codigo_desde_nombre(nombre) == codigo


def test_codigo_desde_nombre_largo_respeta_80_caracteres():
    codigo = codigo_desde_nombre("sucursal " * 30)
    assert len(codigo) <= 80
    assert not codigo.endswith("-")


@pytest.mark.parametrize("codigo", ["ab", "AGT GALERIAS", "-AGT", "AGT.1", "X" * 81, ""])
def test_codigos_invalidos(codigo):
    with pytest.raises(AgenteError):
        validar_codigo(codigo)


def test_codigo_se_normaliza_a_mayusculas():
    assert validar_codigo(" agt-galerias ") == "AGT-GALERIAS"
