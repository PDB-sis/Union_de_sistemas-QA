"""Alta y administración de agentes de tienda (tabla agente_sucursal).

Uso (desde CYSN_QA/backend, con el .env del servidor):

    python -m app.agentes sucursales
    python -m app.agentes crear --sucursal-id 4
    python -m app.agentes crear --dim-id 1028
    python -m app.agentes crear --sucursal "galerias" --codigo AGT-GALERIAS
    python -m app.agentes rotar-token --codigo AGT-GALERIAS
    python -m app.agentes desactivar --codigo AGT-GALERIAS
    python -m app.agentes activar --codigo AGT-GALERIAS
    python -m app.agentes listar [--sin-contacto-minutos 10]

Enlace de sucursales con el catálogo de sitios (dimID_Tienda de BODEGA_DATOS,
que PDMC carga en <esquema PDMC>."Ubicacion"):

    python -m app.agentes proponer-enlaces --salida enlaces.csv
    python -m app.agentes aplicar-enlaces enlaces.csv
    python -m app.agentes enlazar --sucursal-id 4 --dim-id 1028

El token solo se muestra una vez, al crear o rotar: en la base se guarda su
SHA-256. Copiarlo al config.env de la tienda (AGENT_CODE y AGENT_TOKEN).
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import secrets
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.security import hash_token_agente
from app.sitios import SitioCatalogo, SucursalCysn, proponer

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_SIN_CONTACTO = 2

# El encabezado X-Agente-Codigo admite de 3 a 80 caracteres.
CODIGO_AGENTE = re.compile(r"[A-Z0-9][A-Z0-9_-]{2,79}")


class AgenteError(Exception):
    """Error de uso: se informa al operador sin traza."""


def generar_token() -> str:
    """43 caracteres URL-safe (256 bits); la API exige al menos 32."""
    return secrets.token_urlsafe(32)


def codigo_desde_nombre(nombre: str) -> str:
    """'Divarius Chinita' -> 'AGT-DIVARIUS-CHINITA'."""
    sin_acentos = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Z0-9]+", "-", sin_acentos.upper()).strip("-")
    return validar_codigo(f"AGT-{slug}"[:80].rstrip("-"))


def validar_codigo(codigo: str) -> str:
    limpio = codigo.strip().upper()
    if not CODIGO_AGENTE.fullmatch(limpio):
        raise AgenteError(
            f"Código de agente inválido: {codigo!r}. Use de 3 a 80 caracteres A-Z, 0-9, '-' o '_'."
        )
    return limpio


def buscar_sucursal(db: Session, sucursal_id: int | None, nombre: str | None, dim_id: int | None = None) -> dict:
    if dim_id is not None:
        fila = db.execute(
            text("SELECT id, empresa_id, nombre FROM sucursal WHERE dim_id_tienda = :dim"),
            {"dim": dim_id},
        ).mappings().first()
        if fila is None:
            raise AgenteError(
                f"Ninguna sucursal está enlazada con dimID_Tienda {dim_id}. "
                "Enlácela primero: python -m app.agentes enlazar --sucursal-id <id> --dim-id <dimID>"
            )
        return dict(fila)

    if sucursal_id is not None:
        fila = db.execute(
            text("SELECT id, empresa_id, nombre FROM sucursal WHERE id = :id"),
            {"id": sucursal_id},
        ).mappings().first()
        if fila is None:
            raise AgenteError(f"No existe la sucursal {sucursal_id}.")
        return dict(fila)

    filas = db.execute(
        text("SELECT id, empresa_id, nombre FROM sucursal WHERE lower(trim(nombre)) = lower(trim(:nombre)) ORDER BY id"),
        {"nombre": nombre},
    ).mappings().all()
    if not filas:
        raise AgenteError(f"No existe una sucursal llamada {nombre!r}. Consulte: python -m app.agentes sucursales")
    if len(filas) > 1:
        ids = ", ".join(f"{f['id']} (empresa {f['empresa_id']})" for f in filas)
        raise AgenteError(f"Hay varias sucursales llamadas {nombre!r}: {ids}. Use --sucursal-id.")
    return dict(filas[0])


def mostrar_credenciales(codigo: str, token: str) -> None:
    print()
    print("Copie estas líneas al config.env de la tienda. El token no se volverá a mostrar:")
    print()
    print(f"AGENT_CODE={codigo}")
    print(f"AGENT_TOKEN={token}")
    print()


def crear(
    db: Session, sucursal_id: int | None, nombre: str | None, codigo: str | None,
    dim_id: int | None = None, esquema: str | None = None,
) -> int:
    """Una tienda se identifica por su sucursal o su dimID; una bodega (sin sucursal en CYSN), por su dimID."""
    if dim_id is not None:
        fila = db.execute(
            text("SELECT id, nombre FROM sucursal WHERE dim_id_tienda = :dim"), {"dim": dim_id}
        ).mappings().first()
        if fila:
            sucursal_id, nombre_sitio = fila["id"], fila["nombre"]
        else:
            sitio = catalogo_sitios(db, esquema_pdmc(esquema)).get(dim_id)
            if sitio is None:
                raise AgenteError(f"dimID_Tienda {dim_id} no existe en el catálogo de sitios ni en las sucursales.")
            sucursal_id, nombre_sitio = None, sitio.nombre
    else:
        sucursal = buscar_sucursal(db, sucursal_id, nombre)
        sucursal_id, nombre_sitio = sucursal["id"], sucursal["nombre"]

    existente = db.execute(
        text("""
            SELECT a.codigo FROM agente_sucursal a LEFT JOIN sucursal s ON s.id = a.sucursal_id
            WHERE a.sucursal_id = CAST(:sid AS BIGINT)
               OR COALESCE(a.dim_id_tienda, s.dim_id_tienda) = CAST(:dim AS INTEGER)
        """),
        {"sid": sucursal_id, "dim": dim_id},
    ).scalar()
    if existente:
        raise AgenteError(
            f"El sitio {nombre_sitio!r} ya tiene el agente {existente}. "
            f"Para un token nuevo use: python -m app.agentes rotar-token --codigo {existente}"
        )

    codigo = validar_codigo(codigo) if codigo else codigo_desde_nombre(nombre_sitio)
    token = generar_token()
    try:
        db.execute(
            text("""
                INSERT INTO agente_sucursal (sucursal_id, dim_id_tienda, codigo, token_hash)
                VALUES (:sucursal_id, :dim_id, :codigo, :token_hash)
            """),
            {"sucursal_id": sucursal_id, "dim_id": dim_id, "codigo": codigo, "token_hash": hash_token_agente(token)},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AgenteError(f"El código {codigo} ya está en uso. Indique otro con --codigo.") from exc

    destino = f"la sucursal {sucursal_id}" if sucursal_id is not None else f"el sitio dimID {dim_id}"
    print(f"Agente {codigo} creado para {destino} ({nombre_sitio}).")
    mostrar_credenciales(codigo, token)
    return EXIT_OK


def rotar_token(db: Session, codigo: str) -> int:
    codigo = validar_codigo(codigo)
    token = generar_token()
    cambiado = db.execute(
        text("""
            UPDATE agente_sucursal SET token_hash = :token_hash, updated_at = now()
            WHERE codigo = :codigo
        """),
        {"codigo": codigo, "token_hash": hash_token_agente(token)},
    ).rowcount
    if not cambiado:
        raise AgenteError(f"No existe el agente {codigo}.")
    db.commit()
    print(f"Token de {codigo} reemplazado. El token anterior deja de funcionar ahora.")
    mostrar_credenciales(codigo, token)
    return EXIT_OK


def cambiar_estado(db: Session, codigo: str, activo: bool) -> int:
    codigo = validar_codigo(codigo)
    cambiado = db.execute(
        text("UPDATE agente_sucursal SET activo = :activo, updated_at = now() WHERE codigo = :codigo"),
        {"codigo": codigo, "activo": activo},
    ).rowcount
    if not cambiado:
        raise AgenteError(f"No existe el agente {codigo}.")
    db.commit()
    print(f"Agente {codigo} {'activado' if activo else 'desactivado'}.")
    return EXIT_OK


def _hace(momento: datetime | None, ahora: datetime) -> str:
    if momento is None:
        return "nunca"
    minutos = int((ahora - momento).total_seconds() // 60)
    return f"hace {minutos} min" if minutos < 120 else f"hace {minutos // 60} h"


def listar(db: Session, sin_contacto_minutos: int | None) -> int:
    filas = db.execute(
        text("""
            SELECT a.codigo, a.activo, a.ultimo_contacto_at, a.sucursal_id, s.nombre,
                   COALESCE(a.dim_id_tienda, s.dim_id_tienda) AS dim_id_tienda,
                   (SELECT count(*) FROM inventario_agente_actual i
                     WHERE i.activo AND (i.sucursal_id = a.sucursal_id
                        OR (a.sucursal_id IS NULL AND i.dim_id_tienda = a.dim_id_tienda))) AS productos
            FROM agente_sucursal a LEFT JOIN sucursal s ON s.id = a.sucursal_id
            ORDER BY s.nombre NULLS LAST, a.codigo
        """)
    ).mappings().all()
    if not filas:
        print("No hay agentes registrados. Cree uno con: python -m app.agentes crear --sucursal-id <id>")
        return EXIT_OK

    # Las bodegas no son sucursales de CYSN: su nombre sale del catálogo de sitios, si está disponible.
    try:
        catalogo = catalogo_sitios(db, esquema_pdmc(None)) if any(f["sucursal_id"] is None for f in filas) else {}
    except AgenteError:
        catalogo = {}

    ahora = datetime.now(timezone.utc)
    atrasados = []
    print(f"{'CÓDIGO':<28} {'SITIO':<32} {'ESTADO':<10} {'ÚLTIMO CONTACTO':<16} PRODUCTOS")
    for f in filas:
        estado = "activo" if f["activo"] else "inactivo"
        if f["sucursal_id"] is not None:
            sucursal = f"{f['sucursal_id']} {f['nombre']}"
        else:
            sitio = catalogo.get(f["dim_id_tienda"])
            sucursal = f"dim {f['dim_id_tienda']} {sitio.nombre if sitio else ''}".strip()
        print(f"{f['codigo']:<28} {sucursal:<32} {estado:<10} "
              f"{_hace(f['ultimo_contacto_at'], ahora):<16} {f['productos']}")
        if sin_contacto_minutos is not None and f["activo"] and (
            f["ultimo_contacto_at"] is None
            or (ahora - f["ultimo_contacto_at"]).total_seconds() > sin_contacto_minutos * 60
        ):
            atrasados.append(f["codigo"])

    if atrasados:
        print()
        print(f"Sin contacto en los últimos {sin_contacto_minutos} min: {', '.join(atrasados)}")
        return EXIT_SIN_CONTACTO
    return EXIT_OK


def filas(db: Session, dim_id: int | None) -> int:
    """Transferencias, devoluciones y usuarios recibidos de los agentes de bodega (agente_fila)."""
    resumen = db.execute(
        text("""
            SELECT dim_id_tienda, tarea, count(*) FILTER (WHERE activo) AS activas,
                   count(*) FILTER (WHERE NOT activo) AS de_baja, max(recibido_at) AS ultimo_cambio
            FROM agente_fila WHERE CAST(:dim AS INTEGER) IS NULL OR dim_id_tienda = :dim
            GROUP BY dim_id_tienda, tarea ORDER BY dim_id_tienda, tarea
        """),
        {"dim": dim_id},
    ).mappings().all()
    if not resumen:
        print("Ningún agente ha enviado todavía transferencias, devoluciones ni usuarios.")
        return EXIT_OK
    ahora = datetime.now(timezone.utc)
    print(f"{'SITIO':>6}  {'TAREA':<16} {'ACTIVAS':>8} {'DE BAJA':>8}  ÚLTIMO CAMBIO")
    for f in resumen:
        print(f"{f['dim_id_tienda']:>6}  {f['tarea']:<16} {f['activas']:>8} {f['de_baja']:>8}  {_hace(f['ultimo_cambio'], ahora)}")
    return EXIT_OK


def sucursales(db: Session) -> int:
    filas = db.execute(
        text("""
            SELECT s.id, s.empresa_id, s.nombre, s.dim_id_tienda, a.codigo
            FROM sucursal s LEFT JOIN agente_sucursal a ON a.sucursal_id = s.id
            ORDER BY s.empresa_id, s.nombre
        """)
    ).mappings().all()
    print(f"{'ID':>5} {'EMPRESA':>7}  {'NOMBRE':<32} {'DIM_ID':>6}  AGENTE")
    for f in filas:
        dim = f["dim_id_tienda"] if f["dim_id_tienda"] is not None else "-"
        print(f"{f['id']:>5} {f['empresa_id']:>7}  {f['nombre']:<32} {dim:>6}  {f['codigo'] or '-'}")
    return EXIT_OK


# --- Enlace con el catálogo de sitios ------------------------------------------------

COLUMNAS_ENLACE = [
    "confirmar", "sucursal_id", "empresa", "sucursal", "identificador_inventario",
    "dim_id_tienda", "sitio", "tipo", "similitud", "alternativa_dim_id", "alternativa", "similitud_alternativa",
]
CONFIRMA = {"si", "sí", "s", "x", "1"}


def esquema_pdmc(valor: str | None) -> str:
    esquema = (valor or os.getenv("CYSN_PDMC_SCHEMA", "pdmc")).strip()
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", esquema):
        raise AgenteError(f"Esquema PDMC inválido: {esquema!r}.")
    return esquema


def catalogo_sitios(db: Session, esquema: str) -> dict[int, SitioCatalogo]:
    try:
        filas = db.execute(
            text(f'SELECT "dimIdTienda", nombre, tipo::text FROM "{esquema}"."Ubicacion" WHERE "dimIdTienda" IS NOT NULL')
        ).all()
    except Exception as exc:
        db.rollback()
        raise AgenteError(
            f'No se pudo leer el catálogo de sitios en {esquema}."Ubicacion". '
            "Debe existir la migración de sitios de PDMC y haberse sincronizado SUCURSALES."
        ) from exc
    if not filas:
        raise AgenteError(f'El catálogo {esquema}."Ubicacion" no tiene sitios con dimID: sincronice SUCURSALES en PDMC.')
    return {int(d): SitioCatalogo(int(d), n, t) for d, n, t in filas}


def proponer_enlaces(db: Session, salida: Path, esquema: str | None) -> int:
    catalogo = catalogo_sitios(db, esquema_pdmc(esquema))
    usados = {int(x) for x in db.execute(text("SELECT dim_id_tienda FROM sucursal WHERE dim_id_tienda IS NOT NULL")).scalars()}
    pendientes = [
        SucursalCysn(r["id"], r["empresa"], r["nombre"], r["identificador_inventario"])
        for r in db.execute(text("""
            SELECT s.id, e.nombre AS empresa, s.nombre, s.identificador_inventario
            FROM sucursal s JOIN empresa e ON e.id = s.empresa_id
            WHERE s.dim_id_tienda IS NULL ORDER BY s.id
        """)).mappings()
    ]
    if not pendientes:
        print("Todas las sucursales ya están enlazadas.")
        return EXIT_OK

    propuestas = proponer(pendientes, [s for d, s in catalogo.items() if d not in usados])
    try:
        salida.parent.mkdir(parents=True, exist_ok=True)
        f = salida.open("w", encoding="utf-8-sig", newline="")
    except OSError as exc:
        raise AgenteError(f"No se pudo crear {salida}: {exc.strerror}.") from exc
    with f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUMNAS_ENLACE)
        for p in propuestas:
            w.writerow([
                "SI" if p.confirmar else "", p.sucursal.id, p.sucursal.empresa, p.sucursal.nombre,
                p.sucursal.identificador or "",
                p.sitio.dim_id_tienda if p.sitio else "", p.sitio.nombre if p.sitio else "",
                p.sitio.tipo if p.sitio else "", f"{p.similitud:.2f}",
                p.alternativa.dim_id_tienda if p.alternativa else "", p.alternativa.nombre if p.alternativa else "",
                f"{p.similitud_alternativa:.2f}",
            ])
    claras = sum(p.confirmar for p in propuestas)
    print(f"{len(propuestas)} sucursales sin enlazar: {claras} propuestas claras (confirmar=SI) y {len(propuestas) - claras} para revisar.")
    print(f"Revise {salida}: deje SI solo en las correctas; para otra, cambie dim_id_tienda. Luego:")
    print(f"    python -m app.agentes aplicar-enlaces {salida}")
    return EXIT_OK


def _asignar_dim(db: Session, sucursal_id: int, dim_id: int | None) -> None:
    cambiado = db.execute(
        text("UPDATE sucursal SET dim_id_tienda = :dim, updated_at = now() WHERE id = :id"),
        {"id": sucursal_id, "dim": dim_id},
    ).rowcount
    if not cambiado:
        raise AgenteError(f"No existe la sucursal {sucursal_id}.")


def aplicar_enlaces(db: Session, archivo: Path, esquema: str | None) -> int:
    catalogo = catalogo_sitios(db, esquema_pdmc(esquema))
    try:
        with archivo.open(encoding="utf-8-sig", newline="") as f:
            muestra = f.read(4096); f.seek(0)
            filas = list(csv.DictReader(f, delimiter=";" if muestra.count(";") >= muestra.count(",") else ","))
    except OSError as exc:
        raise AgenteError(f"No se pudo leer {archivo}: {exc.strerror}.") from exc
    except UnicodeDecodeError as exc:
        raise AgenteError(f"{archivo} no está en UTF-8. En Excel use 'Guardar como' > 'CSV UTF-8'.") from exc
    elegidas = [r for r in filas if (r.get("confirmar") or "").strip().lower() in CONFIRMA]
    if not elegidas:
        raise AgenteError(f"{archivo} no tiene filas con confirmar=SI.")

    enlaces: dict[int, int] = {}
    for n, r in enumerate(elegidas, start=2):
        try:
            sucursal_id, dim_id = int(r["sucursal_id"]), int(r["dim_id_tienda"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AgenteError(f"Fila {n}: sucursal_id y dim_id_tienda deben ser números.") from exc
        if dim_id not in catalogo:
            raise AgenteError(f"Fila {n}: dimID_Tienda {dim_id} no existe en el catálogo de sitios.")
        if dim_id in enlaces.values():
            raise AgenteError(f"Fila {n}: dimID_Tienda {dim_id} está asignado a más de una sucursal.")
        enlaces[sucursal_id] = dim_id

    try:
        for sucursal_id, dim_id in enlaces.items():
            _asignar_dim(db, sucursal_id, dim_id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AgenteError("Algún dimID_Tienda ya está enlazado con otra sucursal; no se aplicó ningún cambio.") from exc
    except AgenteError:
        db.rollback()
        raise
    print(f"{len(enlaces)} sucursales enlazadas.")
    return EXIT_OK


def enlazar(db: Session, sucursal_id: int, dim_id: int | None, esquema: str | None) -> int:
    if dim_id is not None and dim_id not in catalogo_sitios(db, esquema_pdmc(esquema)):
        raise AgenteError(f"dimID_Tienda {dim_id} no existe en el catálogo de sitios.")
    try:
        _asignar_dim(db, sucursal_id, dim_id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AgenteError(f"dimID_Tienda {dim_id} ya está enlazado con otra sucursal.") from exc
    print(f"Sucursal {sucursal_id} {'enlazada con dimID_Tienda ' + str(dim_id) if dim_id is not None else 'desenlazada'}.")
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.agentes", description="Administra los agentes de tienda.")
    sub = parser.add_subparsers(dest="comando", required=True)

    sub.add_parser("sucursales", help="Lista las sucursales y su agente, si tienen.")
    p_filas = sub.add_parser("filas", help="Transferencias, devoluciones y usuarios recibidos de las bodegas.")
    p_filas.add_argument("--dim-id", type=int, help="Solo este sitio.")

    p_crear = sub.add_parser("crear", help="Registra el agente de una sucursal y muestra su token.")
    destino = p_crear.add_mutually_exclusive_group(required=True)
    destino.add_argument("--sucursal-id", type=int)
    destino.add_argument("--sucursal", help="Nombre exacto de la sucursal (sin distinguir mayúsculas).")
    destino.add_argument("--dim-id", type=int, help="dimID_Tienda del sitio: tienda enlazada o bodega del catálogo.")
    p_crear.add_argument("--codigo", help="Código del agente (por defecto AGT-<NOMBRE>).")
    p_crear.add_argument("--esquema-pdmc", help="Esquema de PDMC con el catálogo de sitios, para bodegas (por defecto CYSN_PDMC_SCHEMA o pdmc).")

    ayuda_esquema = "Esquema de PDMC con el catálogo de sitios (por defecto CYSN_PDMC_SCHEMA o pdmc)."
    p_proponer = sub.add_parser("proponer-enlaces", help="Propone el dimID_Tienda de cada sucursal sin enlazar (CSV para revisar).")
    p_proponer.add_argument("--salida", type=Path, default=Path("enlaces-sucursales.csv"))
    p_proponer.add_argument("--esquema-pdmc", help=ayuda_esquema)
    p_aplicar = sub.add_parser("aplicar-enlaces", help="Aplica las filas con confirmar=SI del CSV revisado.")
    p_aplicar.add_argument("archivo", type=Path)
    p_aplicar.add_argument("--esquema-pdmc", help=ayuda_esquema)
    p_enlazar = sub.add_parser("enlazar", help="Enlaza (o desenlaza) una sucursal con un dimID_Tienda.")
    p_enlazar.add_argument("--sucursal-id", type=int, required=True)
    grupo_dim = p_enlazar.add_mutually_exclusive_group(required=True)
    grupo_dim.add_argument("--dim-id", type=int)
    grupo_dim.add_argument("--quitar", action="store_true", help="Quita el enlace de la sucursal.")
    p_enlazar.add_argument("--esquema-pdmc", help=ayuda_esquema)

    for nombre, ayuda in (
        ("rotar-token", "Genera un token nuevo; el anterior deja de funcionar."),
        ("desactivar", "Rechaza los envíos del agente sin borrarlo."),
        ("activar", "Vuelve a aceptar los envíos del agente."),
    ):
        sub.add_parser(nombre, help=ayuda).add_argument("--codigo", required=True)

    p_listar = sub.add_parser("listar", help="Agentes, último contacto y productos recibidos.")
    p_listar.add_argument(
        "--sin-contacto-minutos", type=int, default=None,
        help=f"Sale con código {EXIT_SIN_CONTACTO} si algún agente activo lleva más de N minutos sin enviar.",
    )

    args = parser.parse_args(argv)

    # Importación diferida: --help no necesita .env ni conexión.
    from app.db.database import SessionLocal

    with SessionLocal() as db:
        try:
            if args.comando == "sucursales":
                return sucursales(db)
            if args.comando == "filas":
                return filas(db, args.dim_id)
            if args.comando == "crear":
                return crear(db, args.sucursal_id, args.sucursal, args.codigo, args.dim_id, args.esquema_pdmc)
            if args.comando == "proponer-enlaces":
                return proponer_enlaces(db, args.salida, args.esquema_pdmc)
            if args.comando == "aplicar-enlaces":
                return aplicar_enlaces(db, args.archivo, args.esquema_pdmc)
            if args.comando == "enlazar":
                return enlazar(db, args.sucursal_id, None if args.quitar else args.dim_id, args.esquema_pdmc)
            if args.comando == "rotar-token":
                return rotar_token(db, args.codigo)
            if args.comando in ("desactivar", "activar"):
                return cambiar_estado(db, args.codigo, args.comando == "activar")
            return listar(db, args.sin_contacto_minutos)
        except AgenteError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
