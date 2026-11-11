import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { NegativosError } from "../negativos/validation";
import { toCsv } from "./csv";
import { cargaInventario, cargasAgente, firmaAgente, firmaInventario, sitiosConInventario, type TareaAgente } from "./agente";
import { adoptarInventarioHeredado } from "../inventario/sitios";
import type { Modulo, OpcionesEjecucion } from "./modulos";
import { cuentaDelSitio } from "./cuentas";
import { restablecimientoPendiente } from "../admin/reset";
import { AuthError } from "../auth/service";
import type { SystemAuthorization } from "../auth/authorization";
import type { Permission } from "@pdmc/contratos/auth/permissions";

// Las consultas viven en backend/sqlserver/consultas, sin importar desde dónde se ejecute.
const consultasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sqlserver", "consultas");
import { runQuery } from "./sqlserver";

const RETENTION_DAYS = 30;
const MAX_ERROR = 2_000;

export type ResultadoEjecucion =
  | { estado: "OMITIDA" }
  /** Hay un restablecimiento del proyecto preparado: no se carga nada hasta que se confirme o venza. */
  | { estado: "PAUSADA" }
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
  let sinCambios = true, omitidos = 0;
  const permiso = permisoPorTarea[tarea];
  for (const carga of cargas) {
    // Cada bodega se carga con la cuenta de sincronización de su región. Si la región no
    // tiene una activa, esa bodega se omite (con aviso) y las demás regiones siguen.
    let acceso: SystemAuthorization | undefined, cuenta: string | undefined;
    if (permiso) {
      const resuelta = await cuentaDelSitio(db, carga.ubicacionId);
      const aviso = "aviso" in resuelta ? resuelta.aviso : await motivoDeRechazo(resuelta.acceso.permitted(permiso));
      if (aviso || "aviso" in resuelta) {
        omitidos++;
        porSitio.push({ dimIdTienda: carga.dimIdTienda, sitio: carga.nombre, filas: carga.filas, omitido: aviso });
        continue;
      }
      acceso = resuelta.acceso; cuenta = resuelta.cuenta;
    }
    const r = await modulo.importar(db, carga.csv, { ...opciones, acceso, sitio: { ubicacionId: carga.ubicacionId, dimIdTienda: carga.dimIdTienda } });
    sinCambios &&= r.sinCambios;
    porSitio.push({ dimIdTienda: carga.dimIdTienda, sitio: carga.nombre, filas: carga.filas, cuenta, resumen: r.resumen });
  }
  // Con bodegas omitidas no se guarda la huella: así se reintentan en cuanto su región tenga cuenta.
  return { hash: omitidos ? createHash("sha256").update(`${firma}:incompleta`).digest("hex") : firma, totalFilas: filas, result: { sinCambios: sinCambios && !omitidos, resumen: { fuente: "agente", sitios: porSitio, ...(omitidos ? { bodegasOmitidas: omitidos } : {}) } } };
}

// Transferencias y devoluciones son datos de cada bodega: se cargan con la cuenta de su región.
// Los facturadores (usuarios) son un catálogo común, sin región.
const permisoPorTarea: Record<TareaAgente, Permission | null> = { transferencias: "transferencias.importar", devoluciones: "devoluciones.importar", usuarios: null };

/** Cuenta inactiva o de otra región: el motivo, para omitir esa bodega en lugar de detener todo. */
function motivoDeRechazo(comprobacion: Promise<void>) {
  return comprobacion.then(() => undefined, (error: unknown) => {
    if (error instanceof AuthError) return error.message;
    throw error;
  });
}

/**
 * Fuente inventario de los agentes (fase 2b-2): una carga por cada bodega que envía inventario,
 * a nombre de la cuenta de sincronización de su región. Una bodega sin cuenta o con un error se
 * omite con aviso y se reintenta; las demás regiones siguen. La primera carga de una bodega publica
 * su primera fotografía de negativos, para que la región empiece completa.
 */
async function desdeInventarioAgente(db: PrismaClient, modulo: Modulo, ultimoHash: string | null, opciones: OpcionesEjecucion): Promise<Aplicado> {
  // Los datos de antes (un solo sitio) se asignan a su bodega antes de cargar.
  await adoptarInventarioHeredado(db);
  const { bodegas, fueraDelCatalogo } = await sitiosConInventario(db);
  const firmas = await Promise.all(bodegas.map(async bodega => ({ bodega, ...(await firmaInventario(db, bodega.dim)) })));
  const firma = createHash("sha256").update(JSON.stringify(["inventario-sitios", ...firmas.map(f => [f.dim, f.firma])])).digest("hex");
  const totalFilas = firmas.reduce((suma, f) => suma + f.filas, 0);
  const avisoCatalogo = fueraDelCatalogo.length ? `Los sitios ${fueraDelCatalogo.join(", ")} envían inventario pero no están en el catálogo de PDMC: sincronice SUCURSALES.` : undefined;
  if (!opciones.publicarNegativos && modulo.omitirSiIgual && firma === ultimoHash) return { hash: firma, totalFilas, result: { sinCambios: true } };
  if (!bodegas.length) return { hash: firma, totalFilas: 0, result: { sinCambios: true, resumen: { aviso: avisoCatalogo ?? "Ningún agente de bodega ha enviado inventario todavía." } } };
  const porSitio = [];
  let sinCambios = true, omitidos = 0;
  for (const { bodega, filas } of firmas) {
    if (!filas) { porSitio.push({ dimIdTienda: bodega.dim, sitio: bodega.nombre, filas, omitido: "El agente todavía no envió productos activos." }); continue; }
    const resuelta = await cuentaDelSitio(db, bodega.id);
    if ("aviso" in resuelta) { omitidos++; porSitio.push({ dimIdTienda: bodega.dim, sitio: bodega.nombre, filas, omitido: resuelta.aviso }); continue; }
    try {
      const carga = await cargaInventario(db, bodega.dim);
      const primera = !(await db.fotoNegativos.count({ where: { ubicacionId: bodega.id } }));
      const result = await modulo.importar(db, carga.csv, { ...opciones, publicarNegativos: opciones.publicarNegativos || primera, acceso: resuelta.acceso, sitio: { ubicacionId: bodega.id, dimIdTienda: bodega.dim } });
      sinCambios &&= result.sinCambios;
      porSitio.push({ dimIdTienda: bodega.dim, sitio: bodega.nombre, filas: carga.filas, cuenta: resuelta.cuenta, region: resuelta.region, ...(primera ? { primeraFotografia: true } : {}), importacion: result.resumen });
    } catch (error) {
      // Un error de una bodega (por ejemplo, el límite de fotografías) no detiene a las demás.
      omitidos++;
      porSitio.push({ dimIdTienda: bodega.dim, sitio: bodega.nombre, filas, omitido: error instanceof Error ? error.message : String(error) });
    }
  }
  if (omitidos === firmas.filter(f => f.filas).length && omitidos) throw new Error(porSitio.map(s => `${s.sitio}: ${"omitido" in s ? s.omitido : ""}`).join(" · "));
  return { hash: omitidos ? createHash("sha256").update(`${firma}:incompleta`).digest("hex") : firma, totalFilas, result: { sinCambios: sinCambios && !omitidos, resumen: { fuente: "agente", sitios: porSitio, ...(omitidos ? { bodegasOmitidas: omitidos } : {}), ...(avisoCatalogo ? { aviso: avisoCatalogo } : {}) } } };
}

/**
 * Ejecuta el módulo desde su fuente (SQL Server o agentes) y entrega el resultado,
 * como CSV, a la misma importación que hoy recibe el archivo cargado manualmente.
 */
export async function ejecutarModulo(db: PrismaClient, modulo: Modulo, opciones: OpcionesEjecucion = {}): Promise<ResultadoEjecucion> {
  // Antes de tomar el bloqueo: ni siquiera se registra el intento, para no cambiar los totales revisados.
  if (await restablecimientoPendiente(db)) return { estado: "PAUSADA" };
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
