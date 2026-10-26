import csv
from collections import Counter

from fastapi import UploadFile


ENCABEZADOS_REQUERIDOS = [
    "SucursalOrigen",
    "EstadoCreacion",
    "TablaEmpresa",
    "CodigoBarra",
    "Referencia_CREACION",
    "CodigoMarcaOrigen_CREACION",
    "PrecioDetalUSDMasIVA_CREACION",
    "TasaCambio_CREACION",
    "StatusOrigen_CREACION",
    "Sucursal_EMPRESA",
    "Referencia_EMPRESA",
    "CodigoMarcaOrigen_EMPRESA",
    "PrecioDetalMasIVA_EMPRESA",
    "PrecioDetalUSDMasIVA_EMPRESA",
    "TasaCambio_EMPRESA",
    "PrecioDetalUSDMasIVA_CALCULADO_EMPRESA",
    "StatusOrigen_EMPRESA",
    "Existencia_EMPRESA",
    "EstadoComparacion",
    "DiferenciaReferencia",
    "DiferenciaCodigoMarcaOrigen",
    "DiferenciaPrecio",
    "DiferenciaTasaCambio",
]


ESTADOS_COMPARACION_VALIDOS = {
    "IGUAL",
    "DIFERENCIA",
    "NO SE ENCONTRO EN EMPRESAS",
    "NO SE ENCONTRO EN CREACION",
}


def detectar_codificacion(muestra: bytes) -> str:
    codificaciones = [
        "utf-8-sig",
        "utf-8",
        "cp1252",
        "latin-1",
    ]

    for codificacion in codificaciones:
        try:
            muestra.decode(codificacion)
            return codificacion
        except UnicodeDecodeError:
            continue

    raise ValueError(
        "No se pudo determinar la codificación del archivo."
    )


def detectar_delimitador(
    muestra_texto: str,
) -> str:
    try:
        dialecto = csv.Sniffer().sniff(
            muestra_texto,
            delimiters=";,\t|",
        )

        return dialecto.delimiter

    except csv.Error:
        raise ValueError(
            "No se pudo determinar el separador del archivo CSV."
        )


def analizar_archivo_qa(
    archivo: UploadFile,
) -> dict:
    archivo.file.seek(0)

    muestra = archivo.file.read(65536)

    archivo.file.seek(0)

    if not muestra:
        raise ValueError(
            "El archivo está vacío."
        )

    codificacion = detectar_codificacion(muestra)

    muestra_texto = muestra.decode(
        codificacion,
        errors="strict",
    )

    delimitador = detectar_delimitador(
        muestra_texto
    )

    archivo_texto = None

    try:
        import io

        archivo_texto = io.TextIOWrapper(
            archivo.file,
            encoding=codificacion,
            newline="",
        )

        lector = csv.DictReader(
            archivo_texto,
            delimiter=delimitador,
        )

        if lector.fieldnames is None:
            raise ValueError(
                "El archivo no contiene encabezados."
            )

        encabezados = [
            encabezado.strip()
            for encabezado in lector.fieldnames
            if encabezado is not None
        ]

        lector.fieldnames = encabezados

        faltantes = [
            encabezado
            for encabezado in ENCABEZADOS_REQUERIDOS
            if encabezado not in encabezados
        ]

        if faltantes:
            raise ValueError(
                "Faltan encabezados requeridos: "
                + ", ".join(faltantes)
            )

        columnas_extra = [
            encabezado
            for encabezado in encabezados
            if encabezado not in ENCABEZADOS_REQUERIDOS
        ]

        total_registros = 0

        estados = Counter()

        estados_desconocidos = Counter()

        for fila in lector:
            if not any(
                str(valor or "").strip()
                for valor in fila.values()
            ):
                continue

            total_registros += 1

            estado = (
                fila.get("EstadoComparacion")
                or ""
            ).strip().upper()

            if estado in ESTADOS_COMPARACION_VALIDOS:
                estados[estado] += 1

            elif estado:
                estados_desconocidos[estado] += 1

        return {
            "valido": True,
            "nombre_archivo": archivo.filename,
            "codificacion": codificacion,
            "delimitador": delimitador,
            "total_registros": total_registros,
            "total_columnas": len(encabezados),
            "encabezados": encabezados,
            "columnas_extra": columnas_extra,
            "estados": dict(estados),
            "estados_desconocidos": dict(
                estados_desconocidos
            ),
        }

    finally:
        if archivo_texto is not None:
            try:
                archivo_texto.detach()
            except Exception:
                pass