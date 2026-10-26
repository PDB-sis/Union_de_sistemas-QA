"""Compara lo que envía el agente de una bodega con lo que PDMC ya trae del sincronizador central.

Fase 3a de PLAN-agente-multisitio.md: mientras los dos caminos leen la misma bodega, deben coincidir.

    python -m app.comparar_sitio --dim-id 2004 [--esquema-pdmc pdmc] [--ejemplos 5]

Sale con 0 si todo coincide, 1 si hay diferencias y 2 si no se pudo comparar. El sincronizador
central corre cada minuto y el agente cada 5: un cambio muy reciente puede aparecer como diferencia
y desaparecer en la siguiente ejecución.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import text
from sqlalchemy.orm import Session

EXIT_IGUAL, EXIT_DIFERENCIAS, EXIT_ERROR = 0, 1, 2


def txt(valor) -> str:
    """Igual que unwrap() de PDMC: sin espacios y sin el ="..." de Excel."""
    s = "" if valor is None else str(valor).strip()
    m = re.fullmatch(r'="(.*)"', s)
    return m.group(1) if m else s


def codigo(valor) -> str:
    return txt(valor).upper()


def fecha(valor) -> date | None:
    if valor is None or isinstance(valor, date):
        return valor
    try:
        return datetime.strptime(txt(valor), "%m/%d/%Y").date()
    except ValueError:
        return None


def numero(valor) -> Decimal | None:
    s = txt(valor).replace(",", ".")
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


@dataclass
class Resultado:
    modulo: str
    agente: int = 0
    pdmc: int = 0
    iguales: int = 0
    solo_agente: list[str] = field(default_factory=list)
    solo_pdmc: list[str] = field(default_factory=list)
    distintos: dict[str, list[str]] = field(default_factory=dict)

    @property
    def coincide(self) -> bool:
        return not self.solo_agente and not self.solo_pdmc and not self.distintos

    def comparar(self, agente: dict[str, dict], pdmc: dict[str, dict]) -> "Resultado":
        self.agente, self.pdmc = len(agente), len(pdmc)
        self.solo_agente = sorted(k for k in agente if k not in pdmc)
        self.solo_pdmc = sorted(k for k in pdmc if k not in agente)
        for k in agente.keys() & pdmc.keys():
            campos = [c for c in agente[k] if agente[k][c] != pdmc[k].get(c)]
            for c in campos:
                self.distintos.setdefault(c, []).append(f"{k}: agente={agente[k][c]!r} pdmc={pdmc[k].get(c)!r}")
            if not campos:
                self.iguales += 1
        return self


def filas_agente(db: Session, dim: int, tarea: str) -> list[dict]:
    return [r[0] for r in db.execute(
        text("SELECT datos FROM agente_fila WHERE dim_id_tienda = :dim AND tarea = :tarea AND activo"),
        {"dim": dim, "tarea": tarea},
    )]


def columna(d: dict, nombre: str):
    """Las columnas llegan con el nombre de la consulta; se buscan sin distinguir mayúsculas."""
    for k, v in d.items():
        if k.lower() == nombre.lower():
            return v
    return None


def comparar_transferencias(db: Session, dim: int, esq: str) -> list[Resultado]:
    agente_lineas, agente_cab = {}, {}
    for d in filas_agente(db, dim, "transferencias"):
        n = txt(columna(d, "Numero"))
        clave = f"{n} | {txt(columna(d, 'CodigoBarra'))} | {txt(columna(d, 'NumeroCaja'))}"
        agente_lineas[clave] = {"cantidad": numero(columna(d, "Cantidad"))}
        agente_cab[n] = {
            "fecha": fecha(columna(d, "fecha_formateada")), "estado": txt(columna(d, "status")),
            "tienda": codigo(columna(d, "codigoRecibe_Dletra")), "facturador": codigo(columna(d, "CodNombre")),
            "observacion": txt(columna(d, "observacion")),
        }
    pdmc_lineas, pdmc_cab = {}, {}
    for n, cb, caja, cant in db.execute(text(f'''
        SELECT t.numero, d."codigoBarra", d."numeroCaja", d.cantidad
        FROM "{esq}"."TransferenciaConsultaDetalle" d JOIN "{esq}"."TransferenciaConsulta" t ON t.id = d."transferenciaId"
        WHERE t."bajaEn" IS NULL''')):
        pdmc_lineas[f"{txt(n)} | {txt(cb)} | {txt(caja)}"] = {"cantidad": Decimal(cant)}
    for n, f, est, tienda, fact, obs in db.execute(text(f'''
        SELECT numero, fecha, estado, "codigoTiendaConsulta", "codigoFacturador", observacion
        FROM "{esq}"."TransferenciaConsulta" WHERE "bajaEn" IS NULL''')):
        pdmc_cab[txt(n)] = {"fecha": f, "estado": txt(est), "tienda": codigo(tienda), "facturador": codigo(fact), "observacion": txt(obs)}
    return [Resultado("transferencias (cabeceras)").comparar(agente_cab, pdmc_cab),
            Resultado("transferencias (líneas por producto y caja)").comparar(agente_lineas, pdmc_lineas)]


def comparar_devoluciones(db: Session, dim: int, esq: str) -> Resultado:
    agente = {}
    for d in filas_agente(db, dim, "devoluciones"):
        agente[txt(columna(d, "Numero"))] = {
            "fecha": fecha(columna(d, "fecha_formateada")), "estado": txt(columna(d, "status")),
            "tienda": codigo(columna(d, "codigoRecibe_Dletra")), "responsable": codigo(columna(d, "CodNombre")),
            "observacion": txt(columna(d, "Observacion")), "total_valor": numero(columna(d, "TotalValor")),
            "documento_origen": txt(columna(d, "DocumentoOrigen")) or None,
        }
    pdmc = {}
    for n, f, est, tienda, resp, obs, valor, doc in db.execute(text(f'''
        SELECT numero, fecha, estado, "codigoTiendaConsulta", "codigoResponsable", observacion, "totalValor", "documentoOrigen"
        FROM "{esq}"."DevolucionConsulta" WHERE "bajaEn" IS NULL''')):
        pdmc[txt(n)] = {"fecha": f, "estado": txt(est), "tienda": codigo(tienda), "responsable": codigo(resp),
                        "observacion": txt(obs), "total_valor": valor, "documento_origen": txt(doc) or None}
    return Resultado("devoluciones").comparar(agente, pdmc)


def comparar_usuarios(db: Session, dim: int, esq: str) -> Resultado:
    agente = {codigo(columna(d, "CodUsuario")): {"nombre": txt(columna(d, "NombreUsuario"))}
              for d in filas_agente(db, dim, "usuarios")}
    pdmc = {codigo(c): {"nombre": txt(n)} for c, n in db.execute(text(
        f'''SELECT codigo, nombre FROM "{esq}"."PerfilLaboral" WHERE tipo = 'FACTURACION' AND activo'''))}
    return Resultado("usuarios (facturadores)").comparar(agente, pdmc)


def mostrar(r: Resultado, ejemplos: int) -> None:
    marca = "OK " if r.coincide else "DIF"
    print(f"\n[{marca}] {r.modulo}: agente {r.agente} | PDMC {r.pdmc} | iguales {r.iguales}")
    for titulo, lista in (("solo en el agente", r.solo_agente), ("solo en PDMC", r.solo_pdmc)):
        if lista:
            print(f"      {len(lista)} {titulo}: {', '.join(lista[:ejemplos])}{' …' if len(lista) > ejemplos else ''}")
    for campo, lista in sorted(r.distintos.items()):
        print(f"      {len(lista)} con '{campo}' distinto, p. ej.:")
        for linea in lista[:ejemplos]:
            print(f"        {linea}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.comparar_sitio", description=__doc__.split("\n\n")[0])
    parser.add_argument("--dim-id", type=int, required=True, help="dimID_Tienda de la bodega (p. ej. 2004).")
    parser.add_argument("--esquema-pdmc", default=os.getenv("CYSN_PDMC_SCHEMA", "pdmc"))
    parser.add_argument("--ejemplos", type=int, default=5, help="Ejemplos a mostrar de cada diferencia.")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", args.esquema_pdmc):
        print(f"Esquema PDMC inválido: {args.esquema_pdmc!r}", file=sys.stderr)
        return EXIT_ERROR

    from app.db.database import SessionLocal  # --help no necesita .env ni conexión

    with SessionLocal() as db:
        db.connection().execute(text("SET TRANSACTION READ ONLY"))
        recibidas = dict(db.execute(text(
            "SELECT tarea, count(*) FROM agente_fila WHERE dim_id_tienda = :dim AND activo GROUP BY tarea"),
            {"dim": args.dim_id}).all())
        if not recibidas:
            print(f"El agente del sitio {args.dim_id} todavía no ha enviado transferencias, devoluciones ni usuarios.")
            return EXIT_ERROR
        resultados = [*comparar_transferencias(db, args.dim_id, args.esquema_pdmc),
                      comparar_devoluciones(db, args.dim_id, args.esquema_pdmc),
                      comparar_usuarios(db, args.dim_id, args.esquema_pdmc)]
    print(f"Comparación del sitio {args.dim_id} (agente) con PDMC (esquema {args.esquema_pdmc}, sincronizador central):")
    for r in resultados:
        mostrar(r, args.ejemplos)
    return EXIT_IGUAL if all(r.coincide for r in resultados) else EXIT_DIFERENCIAS


if __name__ == "__main__":
    sys.exit(main())
