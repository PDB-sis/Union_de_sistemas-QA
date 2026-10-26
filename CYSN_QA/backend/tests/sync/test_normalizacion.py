from decimal import Decimal

import pytest

from app.sync.normalizacion import (
    COLUMNAS_DESTINO,
    a_numero,
    a_texto,
    a_timestamp,
    calcular_hash,
    normalizar_fila,
    normalizar_filas,
)


def fila_origen(**cambios):
    base = {
        "TasaCambio": Decimal("36.5000"),
        "FECHA_TASA_CAMBIO": "2026-10-08 08:00:00",
        "SUCURSAL": "SUCURSAL CENTRO",
        "CodigoBarra": "7591234567890",
        "Referencia": "REF-01",
        "CodigoMarcaOrigen": 12,
        "Concatenado": "REF-0112",
        "Marca": "MARCA",
        "Descripcion": "PRODUCTO",
        "CodigoCategoria": 3,
        "NombreCategoria": "CATEGORIA",
        "Status": True,
        "Existencia": Decimal("10.000"),
        "CostoDolar": Decimal("1.2500"),
        "CostoInicial": Decimal("45.6250"),
        "PrecioPromocion": None,
        "PrecioDetalUSDMasIVA": Decimal("2.32"),
        "PrecioDetalMasIVA": Decimal("84.68"),
        "PrecioMayorUSDMasIVA": Decimal("2.10"),
        "PrecioMayorMasIVA": Decimal("76.56"),
    }
    base.update(cambios)
    return base


# ------------------------------------------------------------
# CodigoBarra (misma regla que n8n)
# ------------------------------------------------------------


@pytest.mark.parametrize(
    "entrada, esperado",
    [
        ("7591234567890", "7591234567890"),
        ("  7591234567890  ", "7591234567890"),
        ("'7591234567890", "7591234567890"),
        ("'''7591234567890", "7591234567890"),
        (" ' 7591234567890", "7591234567890"),
        ("123456789", "123456789"),
    ],
)
def test_codigo_valido_se_limpia(entrada, esperado):
    fila = normalizar_fila(fila_origen(CodigoBarra=entrada))
    assert fila is not None
    assert fila["codigo_barra"] == esperado


@pytest.mark.parametrize(
    "entrada",
    [None, "", "   ", "12345678", "75912345A7890", "7591 234567890", "７５９１２３４５６７８９", "-759123456789"],
)
def test_codigo_invalido_se_descarta(entrada):
    assert normalizar_fila(fila_origen(CodigoBarra=entrada)) is None


def test_conteo_de_descartados_y_duplicados():
    filas = [
        fila_origen(CodigoBarra="111111111", Existencia=1),
        fila_origen(CodigoBarra="abc"),
        fila_origen(CodigoBarra="222222222"),
        fila_origen(CodigoBarra="111111111", Existencia=5),
        fila_origen(CodigoBarra="1234"),
    ]

    resultado = normalizar_filas(filas)

    assert resultado.total_origen == 5
    assert resultado.descartados_codigo_invalido == 2
    assert resultado.duplicados_origen == 1
    assert resultado.codigos_duplicados == ["111111111"]
    assert [f["codigo_barra"] for f in resultado.filas] == ["222222222", "111111111"]
    # Se conserva la última ocurrencia, como el registro_id más reciente de n8n.
    assert resultado.filas[1]["existencia"] == Decimal(5)


# ------------------------------------------------------------
# Nulos, decimales y textos
# ------------------------------------------------------------


def test_numeros_usan_decimal_sin_float():
    fila = normalizar_fila(fila_origen(CostoDolar=Decimal("0.1234567890123456789")))
    assert fila["costo_dolar"] == Decimal("0.1234567890123456789")
    for columna in ("tasa_cambio", "existencia", "precio_detal_usd_mas_iva"):
        assert isinstance(fila[columna], Decimal)


@pytest.mark.parametrize(
    "entrada, esperado",
    [
        (None, None),
        ("", None),
        ("12,5", Decimal("12.5")),
        (" 7.25 ", Decimal("7.25")),
        ("1,234,5", None),
        ("abc", None),
        ("   ", Decimal(0)),  # Number('') === 0 en JS
        (float("nan"), None),
        (float("inf"), None),
        (0.1, Decimal("0.1")),
        (3, Decimal(3)),
        (True, None),
        (Decimal("NaN"), None),
    ],
)
def test_a_numero(entrada, esperado):
    assert a_numero(entrada) == esperado


@pytest.mark.parametrize(
    "entrada, esperado",
    [
        (None, None),
        ("", None),
        ("  texto  ", "  texto  "),
        (12, "12"),
        (True, "true"),
        (False, "false"),
        (Decimal("12.50"), "12.5"),
        (Decimal("100"), "100"),
        (Decimal("1E+2"), "100"),
        (Decimal("0.00"), "0"),
        (1.5, "1.5"),
    ],
)
def test_a_texto_equivalente_a_js(entrada, esperado):
    assert a_texto(entrada) == esperado


def test_status_y_codigos_como_texto():
    fila = normalizar_fila(fila_origen())
    assert fila["status_origen"] == "true"
    assert fila["codigo_marca_origen"] == "12"
    assert fila["codigo_categoria"] == "3"
    assert fila["precio_promocion"] is None


def test_timestamp_se_entrega_como_texto_recortado():
    assert a_timestamp(" 2026-10-08 08:00:00 ") == "2026-10-08 08:00:00"
    assert a_timestamp("") is None
    assert a_timestamp(None) is None


def test_fila_contiene_todas_las_columnas_destino():
    fila = normalizar_fila(fila_origen())
    assert set(fila) == set(COLUMNAS_DESTINO) | {"hash_origen"}


# ------------------------------------------------------------
# Hash
# ------------------------------------------------------------


def test_hash_estable_e_independiente_de_escala_decimal():
    a = normalizar_fila(fila_origen(PrecioDetalUSDMasIVA=Decimal("2.30")))
    b = normalizar_fila(fila_origen(PrecioDetalUSDMasIVA=Decimal("2.3")))
    assert a["hash_origen"] == b["hash_origen"]
    assert len(a["hash_origen"]) == 64


@pytest.mark.parametrize(
    "cambio",
    [
        {"PrecioDetalUSDMasIVA": Decimal("2.33")},
        {"TasaCambio": Decimal("37")},
        {"Descripcion": "OTRO"},
        {"PrecioPromocion": Decimal("1")},
        {"Existencia": None},
    ],
)
def test_hash_cambia_si_cambia_un_campo(cambio):
    base = normalizar_fila(fila_origen())
    otra = normalizar_fila(fila_origen(**cambio))
    assert base["hash_origen"] != otra["hash_origen"]


def test_hash_distingue_nulo_de_texto_vacio_y_numero_de_texto():
    assert calcular_hash({"referencia": None}) != calcular_hash({"referencia": "None"})
    assert calcular_hash({"referencia": "1"}) != calcular_hash({"referencia": Decimal(1)})
