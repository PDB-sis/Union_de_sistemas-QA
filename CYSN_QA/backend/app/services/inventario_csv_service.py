import csv
import hashlib
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from app.services.codigo_barra_service import (
    es_codigo_barra_valido,
    limpiar_codigo_barra,
)
from app.services.sucursal_normalizacion import normalizar


COLUMNAS_INVENTARIO_REQUERIDAS = (
    "TasaCambio",
    "FECHA_TASA_CAMBIO",
    "SUCURSAL",
    "CodigoBarra",
    "Referencia",
    "CodigoMarca",
    "Concatenado",
    "Marca",
    "Descripcion",
    "Status",
    "Existencia",
    "CodigoCategoria",
    "PrecioPromocion",
    "CostoInicial",
    "CostoDolar",
    "PrecioDetalUSDMasIVA",
    "PrecioDetalMasIVA",
    "PrecioMayorUSDMasIVA",
    "PrecioMayorMasIVA",
)


def _decodificar_csv(contenido: bytes) -> tuple[str, str]:
    try:
        return contenido.decode("utf-8-sig"), "utf-8-sig"
    except UnicodeDecodeError:
        try:
            return contenido.decode("cp1252"), "cp1252"
        except UnicodeDecodeError as error:
            raise ValueError(
                "No fue posible leer el CSV. "
                "Se esperaba codificación UTF-8 o Windows-1252."
            ) from error


def _detectar_delimitador(texto: str) -> str:
    muestra = texto[:65536]

    try:
        dialecto = csv.Sniffer().sniff(
            muestra,
            delimiters=";,\t|",
        )
        return dialecto.delimiter
    except csv.Error:
        primera_linea = (
            texto.splitlines()[0]
            if texto.splitlines()
            else ""
        )

        candidatos = {
            ";": primera_linea.count(";"),
            ",": primera_linea.count(","),
            "\t": primera_linea.count("\t"),
            "|": primera_linea.count("|"),
        }

        delimitador, cantidad = max(
            candidatos.items(),
            key=lambda item: item[1],
        )

        if cantidad <= 0:
            raise ValueError(
                "No fue posible detectar el separador del CSV."
            )

        return delimitador


def analizar_csv_inventario(
    *,
    contenido: bytes,
    nombre_archivo: str,
    identificador_esperado: str,
) -> dict:
    texto, encoding = _decodificar_csv(
        contenido
    )

    delimitador = _detectar_delimitador(
        texto
    )

    lector = csv.DictReader(
        io.StringIO(texto),
        delimiter=delimitador,
    )

    if lector.fieldnames is None:
        raise ValueError(
            "El CSV no contiene una fila de encabezados."
        )

    columnas_originales = list(
        lector.fieldnames
    )

    columnas = [
        (columna or "").strip()
        for columna in columnas_originales
    ]

    if any(not columna for columna in columnas):
        raise ValueError(
            "El CSV contiene encabezados vacíos."
        )

    if len(columnas) != len(set(columnas)):
        raise ValueError(
            "El CSV contiene encabezados duplicados."
        )

    faltantes = [
        columna
        for columna in COLUMNAS_INVENTARIO_REQUERIDAS
        if columna not in columnas
    ]

    if faltantes:
        raise ValueError(
            "Faltan columnas requeridas en el CSV: "
            + ", ".join(faltantes)
        )

    mapa_columnas = {
        original: limpia
        for original, limpia in zip(
            columnas_originales,
            columnas,
        )
    }

    total_registros = 0
    registros_codigo_barra_validos = 0
    registros_codigo_barra_ignorados = 0
    sucursales_vacias = 0
    sucursales_detectadas: dict[str, str] = {}

    for fila in lector:
        fila_limpia = {
            mapa_columnas.get(clave, clave): (
                valor
                if valor is not None
                else ""
            )
            for clave, valor in fila.items()
            if clave is not None
        }

        # Ignorar filas totalmente vacías.
        if not any(
            str(valor).strip()
            for valor in fila_limpia.values()
        ):
            continue

        total_registros += 1

        sucursal_original = str(
            fila_limpia.get(
                "SUCURSAL",
                "",
            )
        ).strip()

        if not sucursal_original:
            sucursales_vacias += 1
        else:
            sucursal_normalizada = normalizar(
                sucursal_original
            )

            if sucursal_normalizada:
                sucursales_detectadas.setdefault(
                    sucursal_normalizada,
                    sucursal_original,
                )

        codigo_barra = limpiar_codigo_barra(
            fila_limpia.get(
                "CodigoBarra",
                "",
            )
        )

        if es_codigo_barra_valido(codigo_barra):
            registros_codigo_barra_validos += 1
        else:
            registros_codigo_barra_ignorados += 1

    if total_registros <= 0:
        raise ValueError(
            "El CSV no contiene registros de inventario."
        )

    if sucursales_vacias > 0:
        raise ValueError(
            "El CSV contiene "
            f"{sucursales_vacias} registro(s) con SUCURSAL vacía."
        )

    if len(sucursales_detectadas) != 1:
        nombres = " | ".join(
            sucursales_detectadas.values()
        )

        raise ValueError(
            "El CSV debe contener una sola sucursal. "
            "Se detectaron: "
            + (
                nombres
                if nombres
                else "ninguna"
            )
        )

    if registros_codigo_barra_validos <= 0:
        raise ValueError(
            "El CSV no contiene ningún CodigoBarra válido para procesar. "
            "Se requieren códigos de al menos 9 dígitos y únicamente "
            "caracteres del 0 al 9."
        )

    sucursal_normalizada = next(
        iter(sucursales_detectadas)
    )

    sucursal_original = (
        sucursales_detectadas[
            sucursal_normalizada
        ]
    )

    esperado_normalizado = normalizar(
        identificador_esperado
    )

    if not esperado_normalizado:
        raise ValueError(
            "El identificador esperado de la sucursal está vacío."
        )

    if (
        sucursal_normalizada
        != esperado_normalizado
    ):
        raise ValueError(
            "La SUCURSAL del CSV no coincide con la sucursal "
            "seleccionada. "
            f"CSV: {sucursal_original}. "
            f"Esperada: {identificador_esperado}."
        )

    return {
        "archivo_nombre": nombre_archivo,
        "archivo_tamano_bytes": len(contenido),
        "archivo_sha256": hashlib.sha256(
            contenido
        ).hexdigest(),
        "encoding": encoding,
        "delimitador": delimitador,
        "total_registros": total_registros,
        "registros_codigo_barra_validos": registros_codigo_barra_validos,
        "registros_codigo_barra_ignorados": registros_codigo_barra_ignorados,
        "columnas_detectadas": columnas,
        "sucursal_archivo": sucursal_original,
        "sucursal_normalizada": sucursal_normalizada,
        "identificador_esperado": identificador_esperado,
        "identificador_esperado_normalizado": esperado_normalizado,
    }



def _texto_opcional(
    valor,
    *,
    campo: str,
    numero_fila: int,
    longitud_maxima: int | None = None,
) -> str | None:
    texto = str(valor if valor is not None else "").strip()

    if not texto:
        return None

    if longitud_maxima is not None and len(texto) > longitud_maxima:
        raise ValueError(
            f"Fila {numero_fila}: {campo} supera la longitud máxima "
            f"permitida de {longitud_maxima} caracteres."
        )

    return texto


def _decimal_opcional(
    valor,
    *,
    campo: str,
    numero_fila: int,
) -> Decimal | None:
    texto = str(valor if valor is not None else "").strip()

    if not texto:
        return None

    texto = (
        texto
        .replace("\u00a0", "")
        .replace(" ", "")
    )

    # Admite tanto 1234.56 / 1234,56 como formatos con separador
    # de miles: 1.234,56 / 1,234.56.
    if "," in texto and "." in texto:
        if texto.rfind(",") > texto.rfind("."):
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif "," in texto:
        texto = texto.replace(",", ".")

    try:
        return Decimal(texto)
    except InvalidOperation as error:
        raise ValueError(
            f"Fila {numero_fila}: {campo} contiene un valor numérico "
            f"inválido: {valor!r}."
        ) from error


def _datetime_opcional(
    valor,
    *,
    campo: str,
    numero_fila: int,
) -> datetime | None:
    texto = str(valor if valor is not None else "").strip()

    if not texto:
        return None

    texto_iso = texto
    if texto_iso.endswith("Z"):
        texto_iso = texto_iso[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(texto_iso)
    except ValueError:
        pass

    # Los inventarios de algunas sucursales exportan la hora en formato
    # español de 12 horas, por ejemplo: "25/8/2025 8:05:38 a. m.".
    # Normalizamos únicamente el indicador AM/PM para que strptime pueda
    # interpretarlo sin alterar el resto del valor original.
    texto_12h = texto.replace("\u00a0", " ")
    texto_12h = re.sub(
        r"(?i)\ba\s*\.\s*m\s*\.?",
        "AM",
        texto_12h,
    )
    texto_12h = re.sub(
        r"(?i)\bp\s*\.\s*m\s*\.?",
        "PM",
        texto_12h,
    )
    texto_12h = re.sub(r"\s+", " ", texto_12h).strip()

    formatos = (
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %I:%M:%S %p",
        "%d/%m/%Y %I:%M %p",
        "%d/%m/%Y",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y/%m/%d %I:%M:%S %p",
        "%Y/%m/%d %I:%M %p",
        "%Y/%m/%d",
    )

    for formato in formatos:
        try:
            return datetime.strptime(texto_12h, formato)
        except ValueError:
            continue

    raise ValueError(
        f"Fila {numero_fila}: {campo} contiene una fecha inválida: "
        f"{valor!r}."
    )


def extraer_detalles_csv_inventario(
    *,
    contenido: bytes,
) -> list[dict]:
    """
    Convierte las filas del CSV ya validado a la estructura esperada por
    inventario_detalle.

    CodigoBarra se mantiene SIEMPRE como texto. No se convierte a int ni
    float, por lo que conserva ceros iniciales.

    La función es estricta con valores numéricos/fecha no vacíos: si una
    fila contiene un valor que no puede convertirse, se informa la fila y
    columna y no se devuelve un resultado parcial.
    """
    texto, _encoding = _decodificar_csv(contenido)
    delimitador = _detectar_delimitador(texto)

    lector = csv.DictReader(
        io.StringIO(texto),
        delimiter=delimitador,
    )

    if lector.fieldnames is None:
        raise ValueError(
            "El CSV no contiene una fila de encabezados."
        )

    columnas_originales = list(lector.fieldnames)
    columnas = [
        (columna or "").strip()
        for columna in columnas_originales
    ]

    faltantes = [
        columna
        for columna in COLUMNAS_INVENTARIO_REQUERIDAS
        if columna not in columnas
    ]

    if faltantes:
        raise ValueError(
            "Faltan columnas requeridas en el CSV: "
            + ", ".join(faltantes)
        )

    mapa_columnas = {
        original: limpia
        for original, limpia in zip(
            columnas_originales,
            columnas,
        )
    }

    detalles: list[dict] = []

    for numero_fila, fila in enumerate(lector, start=2):
        fila_limpia = {
            mapa_columnas.get(clave, clave): (
                valor if valor is not None else ""
            )
            for clave, valor in fila.items()
            if clave is not None
        }

        if not any(
            str(valor).strip()
            for valor in fila_limpia.values()
        ):
            continue

        codigo_barra = limpiar_codigo_barra(
            fila_limpia.get("CodigoBarra")
        )

        # Los códigos fuera de la regla operativa se ignoran por completo.
        # No deben bloquear el archivo ni entrar a inventario_detalle.
        if not es_codigo_barra_valido(codigo_barra):
            continue

        if len(codigo_barra) > 100:
            raise ValueError(
                f"Fila {numero_fila}: CodigoBarra supera la longitud máxima "
                "permitida de 100 caracteres."
            )

        detalles.append(
            {
                "numero_fila_archivo": numero_fila,
                "tasa_cambio": _decimal_opcional(
                    fila_limpia.get("TasaCambio"),
                    campo="TasaCambio",
                    numero_fila=numero_fila,
                ),
                "fecha_tasa_cambio": _datetime_opcional(
                    fila_limpia.get("FECHA_TASA_CAMBIO"),
                    campo="FECHA_TASA_CAMBIO",
                    numero_fila=numero_fila,
                ),
                "codigo_barra": codigo_barra,
                "referencia": _texto_opcional(
                    fila_limpia.get("Referencia"),
                    campo="Referencia",
                    numero_fila=numero_fila,
                    longitud_maxima=180,
                ),
                "codigo_marca": _texto_opcional(
                    fila_limpia.get("CodigoMarca"),
                    campo="CodigoMarca",
                    numero_fila=numero_fila,
                    longitud_maxima=100,
                ),
                "concatenado": _texto_opcional(
                    fila_limpia.get("Concatenado"),
                    campo="Concatenado",
                    numero_fila=numero_fila,
                    longitud_maxima=255,
                ),
                "marca": _texto_opcional(
                    fila_limpia.get("Marca"),
                    campo="Marca",
                    numero_fila=numero_fila,
                    longitud_maxima=180,
                ),
                "descripcion": _texto_opcional(
                    fila_limpia.get("Descripcion"),
                    campo="Descripcion",
                    numero_fila=numero_fila,
                ),
                "status": _texto_opcional(
                    fila_limpia.get("Status"),
                    campo="Status",
                    numero_fila=numero_fila,
                    longitud_maxima=100,
                ),
                "existencia": _decimal_opcional(
                    fila_limpia.get("Existencia"),
                    campo="Existencia",
                    numero_fila=numero_fila,
                ),
                "codigo_categoria": _texto_opcional(
                    fila_limpia.get("CodigoCategoria"),
                    campo="CodigoCategoria",
                    numero_fila=numero_fila,
                    longitud_maxima=100,
                ),
                "precio_promocion": _decimal_opcional(
                    fila_limpia.get("PrecioPromocion"),
                    campo="PrecioPromocion",
                    numero_fila=numero_fila,
                ),
                "costo_inicial": _decimal_opcional(
                    fila_limpia.get("CostoInicial"),
                    campo="CostoInicial",
                    numero_fila=numero_fila,
                ),
                "costo_dolar": _decimal_opcional(
                    fila_limpia.get("CostoDolar"),
                    campo="CostoDolar",
                    numero_fila=numero_fila,
                ),
                "precio_detal_usd_mas_iva": _decimal_opcional(
                    fila_limpia.get("PrecioDetalUSDMasIVA"),
                    campo="PrecioDetalUSDMasIVA",
                    numero_fila=numero_fila,
                ),
                "precio_detal_mas_iva": _decimal_opcional(
                    fila_limpia.get("PrecioDetalMasIVA"),
                    campo="PrecioDetalMasIVA",
                    numero_fila=numero_fila,
                ),
                "precio_mayor_usd_mas_iva": _decimal_opcional(
                    fila_limpia.get("PrecioMayorUSDMasIVA"),
                    campo="PrecioMayorUSDMasIVA",
                    numero_fila=numero_fila,
                ),
                "precio_mayor_mas_iva": _decimal_opcional(
                    fila_limpia.get("PrecioMayorMasIVA"),
                    campo="PrecioMayorMasIVA",
                    numero_fila=numero_fila,
                ),
            }
        )

    if not detalles:
        raise ValueError(
            "El CSV no contiene registros de inventario para procesar."
        )

    return detalles
