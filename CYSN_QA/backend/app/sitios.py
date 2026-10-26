"""Enlace de sucursales de CYSN con el catálogo de sitios (BODEGA_DATOS.tbDimTiendas).

Las sucursales de CYSN no tienen código corporativo: se proponen enlaces por
nombre y una persona los revisa antes de aplicarlos (python -m app.agentes).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

# Palabras que no distinguen un sitio de otro.
_GENERICAS = {"suc", "sucursal", "c", "a", "ca", "cc", "centro", "comercial", "sa", "de", "del", "el"}
_ROMANOS = {"i": "1", "ii": "2", "iii": "3", "iv": "4"}

UMBRAL_CONFIRMAR = 0.75
MARGEN_CONFIRMAR = 0.10


@dataclass(frozen=True)
class SitioCatalogo:
    dim_id_tienda: int
    nombre: str
    tipo: str


@dataclass(frozen=True)
class SucursalCysn:
    id: int
    empresa: str
    nombre: str
    identificador: str | None


@dataclass(frozen=True)
class Propuesta:
    sucursal: SucursalCysn
    sitio: SitioCatalogo | None
    similitud: float
    alternativa: SitioCatalogo | None
    similitud_alternativa: float
    confirmar: bool


def normalizar(texto: str | None, quitar: set[str] = frozenset()) -> str:
    """'SUC. CHINITA II' -> 'chinita 2'."""
    sin_acentos = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii").lower()
    palabras = re.sub(r"[^a-z0-9]+", " ", sin_acentos).split()
    return " ".join(_ROMANOS.get(p, p) for p in palabras if p not in _GENERICAS and p not in quitar)


def similitud(a: str, b: str) -> float:
    """Combina orden de letras y palabras compartidas; 0 = nada en común, 1 = iguales."""
    if not a or not b:
        return 0.0
    secuencia = SequenceMatcher(None, a, b).ratio()
    pa, pb = set(a.split()), set(b.split())
    palabras = len(pa & pb) / len(pa | pb)
    contenida = 1.0 if pa <= pb or pb <= pa else 0.0
    return round(max(secuencia, palabras, 0.85 * contenida * palabras + 0.15 * contenida), 3)


def _puntaje(sucursal: SucursalCysn, sitio: SitioCatalogo) -> float:
    # La razón social repite la empresa en todas sus sucursales: se compara con y sin ella,
    # porque algunos sitios del catálogo la incluyen ("SUC CALIDOSO LIBERTAD") y otros no.
    empresa = set(normalizar(sucursal.empresa.replace("_", " ")).split())
    destino = normalizar(sitio.nombre)
    # "NOVEDADES Y TEXTILES YESSICA. CHINITA II": la sucursal suele ir tras el último separador.
    tramos = [t for t in re.split(r"[.,:]", sucursal.identificador or "") if normalizar(t)]
    candidatos = (
        normalizar(sucursal.nombre),
        normalizar(sucursal.identificador),
        normalizar(sucursal.identificador, quitar=empresa),
        normalizar(tramos[-1], quitar=empresa) if tramos else "",
    )
    return max(similitud(c, destino) for c in candidatos)


def proponer(sucursales: list[SucursalCysn], catalogo: list[SitioCatalogo]) -> list[Propuesta]:
    """Mejor sitio para cada sucursal. Solo se marca para confirmar si es claro y no lo reclama otra mejor."""
    puntajes = {
        s.id: sorted(((_puntaje(s, c), c) for c in catalogo), key=lambda x: (-x[0], x[1].dim_id_tienda))
        for s in sucursales
    }
    mejores = {sid: (lista[0] if lista else (0.0, None)) for sid, lista in puntajes.items()}

    # Un sitio solo puede ir a una sucursal: si dos lo reclaman, gana la de mayor similitud.
    reclamado: dict[int, tuple[float, int]] = {}
    for sid, (valor, sitio) in mejores.items():
        if sitio and (sitio.dim_id_tienda not in reclamado or valor > reclamado[sitio.dim_id_tienda][0]):
            reclamado[sitio.dim_id_tienda] = (valor, sid)

    propuestas = []
    for s in sucursales:
        lista = puntajes[s.id]
        valor, sitio = mejores[s.id]
        alt_valor, alternativa = (lista[1][0], lista[1][1]) if len(lista) > 1 else (0.0, None)
        claro = (
            sitio is not None
            and valor >= UMBRAL_CONFIRMAR
            and valor - alt_valor >= MARGEN_CONFIRMAR
            and reclamado[sitio.dim_id_tienda][1] == s.id
        )
        propuestas.append(Propuesta(s, sitio, valor, alternativa, alt_valor, claro))
    return propuestas
