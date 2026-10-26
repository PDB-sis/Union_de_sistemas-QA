"""
Normalización de filas CREACION (SQL Server -> PostgreSQL).

Replica las reglas del nodo n8n "ARMAR LOTES CREACION"
(aportes/creacion lotes.txt):

- CodigoBarra: trim, retirar comillas simples iniciales, trim,
  mínimo 9 caracteres, solo dígitos ASCII. Los inválidos se descartan.
- sqlText: NULL / '' -> NULL; cualquier otro valor -> texto.
- sqlNumber: NULL / '' -> NULL; se reemplaza la primera coma por punto;
  valores no finitos -> NULL.
- sqlTimestamp: NULL / '' -> NULL; texto recortado que PostgreSQL
  convierte a timestamp.

Diferencia intencional con n8n: los números se manejan con Decimal en
lugar de float de JavaScript, por lo que no se pierde precisión.

Este módulo no depende de base de datos para poder probarse aislado.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping

from app.services.codigo_barra_service import (
    es_codigo_barra_valido,
    limpiar_codigo_barra,
)


TEXTO = "texto"
NUMERO = "numero"
TIMESTAMP = "timestamp"


# (columna origen SQL Server, columna public.creacion, tipo)
# El orden es el mismo del INSERT generado por n8n.
COLUMNAS: tuple[tuple[str, str, str], ...] = (
    ("SUCURSAL", "sucursal_origen", TEXTO),
    ("TasaCambio", "tasa_cambio", NUMERO),
    ("FECHA_TASA_CAMBIO", "fecha_tasa_cambio", TIMESTAMP),
    ("CodigoBarra", "codigo_barra", TEXTO),
    ("Referencia", "referencia", TEXTO),
    ("CodigoMarcaOrigen", "codigo_marca_origen", TEXTO),
    ("Concatenado", "concatenado", TEXTO),
    ("Marca", "marca_origen", TEXTO),
    ("Descripcion", "descripcion", TEXTO),
    ("CodigoCategoria", "codigo_categoria", TEXTO),
    ("NombreCategoria", "nombre_categoria", TEXTO),
    ("Status", "status_origen", TEXTO),
    ("Existencia", "existencia", NUMERO),
    ("CostoDolar", "costo_dolar", NUMERO),
    ("CostoInicial", "costo_inicial", NUMERO),
    ("PrecioPromocion", "precio_promocion", NUMERO),
    ("PrecioDetalUSDMasIVA", "precio_detal_usd_mas_iva", NUMERO),
    ("PrecioDetalMasIVA", "precio_detal_mas_iva", NUMERO),
    ("PrecioMayorUSDMasIVA", "precio_mayor_usd_mas_iva", NUMERO),
    ("PrecioMayorMasIVA", "precio_mayor_mas_iva", NUMERO),
)

COLUMNAS_DESTINO: tuple[str, ...] = tuple(
    destino for _, destino, _ in COLUMNAS
)


class ValorInvalidoError(ValueError):
    pass


def _decimal_a_texto(valor: Decimal) -> str:
    """Formato equivalente a String(Number(x)) de JS, sin notación científica."""
    if valor == 0:
        return "0"

    texto = format(valor.normalize(), "f")

    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")

    return texto


def a_texto(valor: Any) -> str | None:
    """Equivalente a sqlText() de n8n (sin el escapado SQL)."""
    if valor is None or valor == "":
        return None

    # String(true) en JS -> 'true'. pyodbc entrega BIT como bool.
    if isinstance(valor, bool):
        return "true" if valor else "false"

    if isinstance(valor, Decimal):
        return _decimal_a_texto(valor)

    if isinstance(valor, float):
        return _decimal_a_texto(Decimal(repr(valor)))

    return str(valor)


def a_numero(valor: Any) -> Decimal | None:
    """Equivalente a sqlNumber() de n8n, pero con Decimal exacto."""
    if valor is None or valor == "":
        return None

    if isinstance(valor, bool):
        # Number(String(true)) -> NaN -> NULL
        return None

    if isinstance(valor, Decimal):
        return valor if valor.is_finite() else None

    if isinstance(valor, int):
        return Decimal(valor)

    if isinstance(valor, float):
        # repr() da la representación más corta, igual que String(num) en JS.
        resultado = Decimal(repr(valor))
        return resultado if resultado.is_finite() else None

    texto = str(valor).strip().replace(",", ".", 1)

    if texto == "":
        # Number('') === 0 en JavaScript.
        return Decimal(0)

    try:
        resultado = Decimal(texto)
    except InvalidOperation:
        return None

    return resultado if resultado.is_finite() else None


def a_timestamp(valor: Any) -> str | datetime | None:
    """
    Equivalente a sqlTimestamp() de n8n.

    Se entrega texto recortado (YYYY-MM-DD HH:MM:SS) para que PostgreSQL
    lo convierta con las mismas reglas que '...'::timestamp.
    """
    if valor is None or valor == "":
        return None

    if isinstance(valor, (datetime, date)):
        return valor

    texto = str(valor).strip()

    return texto or None


_CONVERSORES = {
    TEXTO: a_texto,
    NUMERO: a_numero,
    TIMESTAMP: a_timestamp,
}


def _valor_canonico(valor: Any) -> Any:
    if valor is None:
        return None

    if isinstance(valor, Decimal):
        return "N:" + _decimal_a_texto(valor)

    if isinstance(valor, (datetime, date)):
        return "T:" + valor.isoformat(sep=" ")

    return "S:" + str(valor)


def calcular_hash(fila: Mapping[str, Any]) -> str:
    """SHA-256 estable de los campos de negocio de una fila normalizada."""
    canonico = [
        _valor_canonico(fila.get(columna))
        for columna in COLUMNAS_DESTINO
    ]

    contenido = json.dumps(
        canonico,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        contenido.encode("utf-8")
    ).hexdigest()


def normalizar_fila(origen: Mapping[str, Any]) -> dict[str, Any] | None:
    """
    Convierte una fila de SQL Server al formato de public.creacion.

    Retorna None si el CodigoBarra no es válido (fila descartada).
    """
    codigo = limpiar_codigo_barra(origen.get("CodigoBarra"))

    if not es_codigo_barra_valido(codigo):
        return None

    fila: dict[str, Any] = {}

    for columna_origen, columna_destino, tipo in COLUMNAS:
        if columna_origen == "CodigoBarra":
            fila[columna_destino] = codigo
            continue

        fila[columna_destino] = _CONVERSORES[tipo](
            origen.get(columna_origen)
        )

    fila["hash_origen"] = calcular_hash(fila)

    return fila


@dataclass
class ResultadoNormalizacion:
    filas: list[dict[str, Any]] = field(default_factory=list)
    total_origen: int = 0
    descartados_codigo_invalido: int = 0
    duplicados_origen: int = 0
    codigos_duplicados: list[str] = field(default_factory=list)


def normalizar_filas(
    filas_origen: Iterable[Mapping[str, Any]],
) -> ResultadoNormalizacion:
    """
    Normaliza todas las filas y resuelve CodigoBarra duplicados en origen.

    n8n insertaba los duplicados y la comparación QA usaba el de mayor
    registro_id, es decir, la última fila recibida. Aquí se conserva
    igualmente la última ocurrencia y se informa el conteo.
    """
    resultado = ResultadoNormalizacion()
    por_codigo: dict[str, dict[str, Any]] = {}
    duplicados: set[str] = set()

    for origen in filas_origen:
        resultado.total_origen += 1

        fila = normalizar_fila(origen)

        if fila is None:
            resultado.descartados_codigo_invalido += 1
            continue

        codigo = fila["codigo_barra"]

        if codigo in por_codigo:
            resultado.duplicados_origen += 1
            duplicados.add(codigo)
            # Mover al final para conservar el orden de la última ocurrencia.
            del por_codigo[codigo]

        por_codigo[codigo] = fila

    resultado.filas = list(por_codigo.values())
    resultado.codigos_duplicados = sorted(duplicados)

    return resultado
