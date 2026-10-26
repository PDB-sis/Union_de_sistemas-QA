"""Propuesta de enlace sucursal CYSN -> dimID_Tienda (casos tomados de los datos reales)."""
from app.sitios import SitioCatalogo, SucursalCysn, normalizar, proponer

CATALOGO = [
    SitioCatalogo(1011, "SUC  CALIDOSO LIBERTAD", "TIENDA"),
    SitioCatalogo(1042, "SUC. LIBERTADOR", "TIENDA"),
    SitioCatalogo(1027, "SUC CHINITA I", "TIENDA"),
    SitioCatalogo(1030, "SUC CHINITA II", "TIENDA"),
    SitioCatalogo(1026, "SUC PDB  PLAZA LAGO", "TIENDA"),
    SitioCatalogo(1037, "SUC DVS  PLAZA LAGO", "TIENDA"),
    SitioCatalogo(1028, "SUC. GALERIAS", "TIENDA"),
    SitioCatalogo(2005, "BODEGA MATEO", "BODEGA"),
]


def sucursal(id_, empresa, nombre, identificador=None):
    return SucursalCysn(id_, empresa, nombre, identificador)


def por_sucursal(propuestas):
    return {p.sucursal.id: p for p in propuestas}


def test_normalizar_quita_prefijos_acentos_y_romanos():
    assert normalizar("SUC. CHINITA II") == "chinita 2"
    assert normalizar("  Galerías ") == "galerias"
    assert normalizar("EL CALIDOSO, C.A.  LIBERTAD") == "calidoso libertad"
    assert normalizar(None) == ""


def test_nombre_exacto_se_confirma():
    p = por_sucursal(proponer([sucursal(4, "YESSICA", "galerias")], CATALOGO))[4]
    assert p.sitio.dim_id_tienda == 1028 and p.confirmar


def test_razon_social_con_empresa_distingue_libertad_de_libertador():
    s = sucursal(13, "CALIDOSO", "libertad", "EL CALIDOSO, C.A.  LIBERTAD")
    p = por_sucursal(proponer([s], CATALOGO))[13]
    assert p.sitio.dim_id_tienda == 1011 and p.confirmar


def test_empate_entre_dos_sitios_no_se_confirma():
    # "plaza lago" se parece igual a PDB y DVS PLAZA LAGO: lo decide una persona.
    p = por_sucursal(proponer([sucursal(2, "YESSICA", "plaza lago")], CATALOGO))[2]
    assert not p.confirmar
    assert {p.sitio.dim_id_tienda, p.alternativa.dim_id_tienda} == {1026, 1037}


def test_identificador_desempata_numeros_romanos():
    s = sucursal(5, "YESSICA", "divarius chinita", "NOVEDADES Y TEXTILES YESSICA. CHINITA II")
    p = por_sucursal(proponer([s], CATALOGO))[5]
    assert p.sitio.dim_id_tienda == 1030


def test_un_sitio_reclamado_por_dos_sucursales_solo_se_confirma_para_la_mejor():
    a = sucursal(6, "YESSICA", "galerias")
    b = sucursal(99, "OTRA", "galerias mall norte")
    p = por_sucursal(proponer([a, b], CATALOGO))
    assert p[6].confirmar and p[6].sitio.dim_id_tienda == 1028
    assert not (p[99].confirmar and p[99].sitio.dim_id_tienda == 1028)


def test_sin_parecido_no_se_confirma():
    p = por_sucursal(proponer([sucursal(43, "GIRALDUG", "trendy", "INVERSIONES GIRALDUG 2010. CA.")], CATALOGO))[43]
    assert not p.confirmar


def test_catalogo_vacio():
    p = por_sucursal(proponer([sucursal(1, "YESSICA", "doral")], []))[1]
    assert p.sitio is None and not p.confirmar
