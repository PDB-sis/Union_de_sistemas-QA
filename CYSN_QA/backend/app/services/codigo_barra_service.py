import re


MIN_LONGITUD_CODIGO_BARRA = 9


def limpiar_codigo_barra(valor) -> str:
    """
    Replica la limpieza aprobada del flujo n8n:
    - convierte a texto;
    - elimina espacios exteriores;
    - elimina una o más comillas simples al inicio;
    - vuelve a aplicar trim.

    En NEXO QA NO se agrega una comilla inicial al resultado porque
    CodigoBarra se almacena como texto en PostgreSQL y no necesita el
    artificio usado por Google Sheets.
    """
    codigo = str(valor if valor is not None else "").strip()
    codigo = re.sub(r"^'+", "", codigo)
    return codigo.strip()


def es_codigo_barra_valido(valor) -> bool:
    """
    Regla equivalente al JavaScript suministrado por el usuario.

    IMPORTANTE: el código JavaScript usa `codigo.length < 9`, por lo que
    el mínimo real es 9 caracteres, aunque el comentario original diga
    "menos de 8".

    Solo se aceptan caracteres ASCII del 0 al 9.
    """
    codigo = limpiar_codigo_barra(valor)

    if len(codigo) < MIN_LONGITUD_CODIGO_BARRA:
        return False

    return re.fullmatch(r"[0-9]+", codigo) is not None
