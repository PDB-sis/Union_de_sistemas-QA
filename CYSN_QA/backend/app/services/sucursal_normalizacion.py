import re
import unicodedata


def normalizar(texto: str | None) -> str:
    """
    Replica la función normalizar(texto) utilizada actualmente en n8n.

    Comportamiento:
    1. Convierte None/cadena vacía en ''.
    2. Descompone caracteres Unicode con NFD.
    3. Elimina marcas diacríticas U+0300-U+036F.
    4. Convierte a mayúsculas.
    5. Sustituye cualquier secuencia que no sea A-Z o 0-9 por un espacio.
    6. Colapsa espacios consecutivos.
    7. Elimina espacios al inicio y al final.
    """
    valor = str(texto or "")
    valor = unicodedata.normalize("NFD", valor)
    valor = re.sub(r"[\u0300-\u036f]", "", valor)
    valor = valor.upper()
    valor = re.sub(r"[^A-Z0-9]+", " ", valor)
    valor = re.sub(r"\s+", " ", valor)
    return valor.strip()
