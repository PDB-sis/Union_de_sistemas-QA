import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { NegativosError } from "../negativos/validation";
import { toCsv } from "./csv";
import { cargaInventario, cargasAgente, firmaAgente, firmaInventario, type TareaAgente } from "./agente";
import type { Modulo, OpcionesEjecucion } from "./modulos";

// Las consultas viven en backend/sqlserver/consultas, sin importar desde dónde se ejecute.
const consultasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sqlserver", "consultas");
import { runQuery } from "./sqlserver";

const RETENTION_DAYS = 30;
const MAX_ERROR = 2_000;

export type ResultadoEjecucion =
  | { estado: "OMITIDA" }
  | { estado: "EXITOSA" | "SIN_CAMBIOS"; totalFilas: number; resumen?: unknown }
  | { estado: "FALLIDA"; error: string };

function describe(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR);
}

// Copia serializable para una columna JSON (convierte Decimal y Date a texto).
function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// Los errores de validación de las importaciones incluyen las filas
// rechazadas, que es lo que se necesita para corregir el origen.
function errorDetail(error: unknown) {
  if (!(error instanceof NegativosError)) return undefined;
  const details = json(error.details) as { errores?: unknown[] } | undefined;
  const errores = details?.errores;
  return json({ codigo: error.code, detalle: Array.isArray(errores) ? { ...details, errores: errores.slice(0, 50) } : details });
}

async function acquireLease(db: PrismaClient, modulo: string, minutes: number) {
  await db.sincronizacionEstado.upsert({ where: { modulo }, create: { modulo }, update: {} });
  const leaseId = randomUUID();
  const now = new Date();
  const acquired = await db.sincronizacionEstado.updateMany({
    where: { modulo, OR: [{ bloqueoHasta: null }, { bloqueoHasta: { lt: now } }] },
    data: { bloqueoId: leaseId, bloqueoHasta: new Date(now.getTime() + minutes * 60_000), ultimoIntentoEn: now },
  });
  return acquired.count ? leaseId : null;
}

type Aplicado = { hash: string; totalFilas: number; result: { sinCambios: boolean; resumen?: unknown } };

/** Fuente SQL Server: ejecuta la consulta del módulo y entrega el resultado, como CSV, a su importación. */
async function desdeSqlServer(db: PrismaClient, modulo: Modulo, consulta: string, ultimoHash: string | null, opciones: OpcionesEjecucion): Promise<Aplicado> {
  // Las consultas se copian tal cual de consultaPDMC; algunos editores de Windows les añaden BOM.
  const sqlText = (await readFile(join(consultasDir, consulta), "utf8")).replace(/^\uFEFF/, "");
  const { columns, rows } = await runQuery(sqlText);
  const csv = toCsv(columns, rows);
  const hash = createHash("sha256").update(csv).digest("hex");
  // Publicar la fotografía de negativos siempre se aplica, aunque el inventario no haya cambiado.
  if (!opciones.publicarNegativos && modulo.omitirSiIgual && hash === ultimoHash) return { hash, totalFilas: rows.length, result: { sinCambios: true } };
  return { hash, totalFilas: rows.length, result: await modulo.importar(db, csv, opciones) };
}

/** Fuente agente: lo que enviaron los agentes de cada bodega a agente_fila; una importación por bodega. */
async function desdeAgente(db: PrismaClient, modulo: Modulo, tarea: TareaAgente, columnas: readonly string[], ultimoHash: string | null, opciones: OpcionesEjecucion): Promise<Aplicado> {
  const { firma, filas } = await firmaAgente(db, tarea);
  if (modulo.omitirSiIgual && firma === ultimoHash) return { hash: firma, totalFilas: filas, result: { sinCambios: true } };
  const cargas = await cargasAgente(db, tarea, columnas);
  // Instalación nueva o sitio sin agente: no es un fallo; lo ya importado se conserva.
  if (!cargas.length) return { hash: firma, totalFilas: 0, result: { sinCambios: true, resumen: { aviso: `Ningún agente de bodega ha enviado ${tarea} todavía.` } } };
  const porSitio = [];
  let sinCambios = true;
  for (const carga of cargas) {
    const r = await modulo.importar(db, carga.csv, { ...opciones, sitio: { ubicacionId: carga.ubicacionId, dimIdTienda: carga.dimIdTienda } });
    sinCambios &&= r.sinCambios;
    porSitio.push({ dimIdTienda: carga.dimIdTienda, sitio: carga.nombre, filas: carga.filas, resumen: r.resumen });
  }
  return { hash: firma, totalFilas: filas, result: { sinCambios, resumen: { fuente: "agente", sitios: porSitio } } };
}

/** Fuente inventario del agente: un solo sitio (PDMC_INVENTARIO_DIM_ID); solo productos activos. */
async function desdeInventarioAgente(db: PrismaClient, modulo: Modulo, ultimoHash: string | null, opciones: OpcionesEjecucion): Promise<Aplicado> {
  const { firma, filas } = await firmaInventario(db);
  // Publicar la fotografía de negativos siempre se aplica, aunque el inventario no haya cambiado.
  if (!opciones.publicarNegativos && modulo.omitirSiIgual && firma === ultimoHash) return { hash: firma, totalFilas: filas, result: { sinCambios: true } };
  // Sin inventario del agente todavía: no es un fallo; el inventario vigente se conserva.
  if (!filas && !opciones.publicarNegativos) return { hash: firma, totalFilas: 0, result: { sinCambios: true, resumen: { aviso: "El agente del sitio PDMC_INVENTARIO_DIM_ID todavía no ha enviado inventario." } } };
  const carga = await cargaInventario(db);
  const ubicacion = await db.ubicacion.findUnique({ where: { dimIdTienda: carga.dim }, select: { id: true } });
  const result = await modulo.importar(db, carga.csv, { ...opciones, sitio: { ubicacionId: ubicacion?.id ?? "", dimIdTienda: carga.dim } });
  return { hash: firma, totalFilas: carga.filas, result };
}

/**
 * Ejecuta el módulo desde su fuente (SQL Server o agentes) y entrega el resultado,
 * como CSV, a la misma importación que hoy recibe el archivo cargado manualmente.
 */
export async function ejecutarModulo(db: PrismaClient, modulo: Modulo, opciones: OpcionesEjecucion = {}): Promise<ResultadoEjecucion> {
  const leaseId = await acquireLease(db, modulo.id, modulo.bloqueoMinutos);
  if (!leaseId) return { estado: "OMITIDA" };

  const execution = await db.sincronizacionEjecucion.create({ data: { modulo: modulo.id, estado: "EJECUTANDO" } });
  try {
    const state = await db.sincronizacionEstado.findUniqueOrThrow({ where: { modulo: modulo.id } });
    const fuente = modulo.fuente;
    const { hash, totalFilas, result } = fuente.tipo === "AGENTE"
      ? await desdeAgente(db, modulo, fuente.tarea, fuente.columnas, state.ultimoHash, opciones)
      : fuente.tipo === "AGENTE_INVENTARIO"
        ? await desdeInventarioAgente(db, modulo, state.ultimoHash, opciones)
        : await desdeSqlServer(db, modulo, fuente.consulta, state.ultimoHash, opciones);

    const estado = result.sinCambios ? "SIN_CAMBIOS" : "EXITOSA";
    const finishedAt = new Date();
    await db.sincronizacionEjecucion.update({
      where: { id: execution.id },
      data: { estado, totalFilas, detalle: json(result.resumen), finishedAt },
    });
    await db.sincronizacionEstado.updateMany({
      where: { modulo: modulo.id, bloqueoId: leaseId },
      data: { ultimoExitoEn: finishedAt, ultimoError: null, ultimoHash: hash, bloqueoId: null, bloqueoHasta: null },
    });
    await db.sincronizacionEjecucion.deleteMany({
      where: { modulo: modulo.id, startedAt: { lt: new Date(finishedAt.getTime() - RETENTION_DAYS * 86_400_000) } },
    });
    return { estado, totalFilas, resumen: result.resumen };
  } catch (error) {
    const message = describe(error);
    const detail = errorDetail(error);
    await db.sincronizacionEjecucion.update({
      where: { id: execution.id },
      data: { estado: "FALLIDA", error: message, detalle: detail, finishedAt: new Date() },
    }).catch(() => undefined);
    await db.sincronizacionEstado.updateMany({
      where: { modulo: modulo.id, bloqueoId: leaseId },
      data: { ultimoError: message, bloqueoId: null, bloqueoHasta: null },
    }).catch(() => undefined);
    return { estado: "FALLIDA", error: message };
  }
}
