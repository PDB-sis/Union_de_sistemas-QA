import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { dimInventario } from "../sync/agente";

// Fase 2b-2: cada bodega (sitio) tiene su inventario, sus fotografías de negativos y sus negativos.
// Los negativos se guardan en la Bodega del sitio (Bodega.ubicacionId). La bodega técnica
// "PDMC_GENERAL" guardó los negativos de antes, cuando PDMC leía un único sitio
// (PDMC_INVENTARIO_DIM_ID): esos datos se asignan a esa bodega con adoptarInventarioHeredado.

type Db = PrismaClient | Prisma.TransactionClient;
export const BODEGA_GENERAL = "PDMC_GENERAL";

/** Registro de negativos de un sitio; se crea si el sitio todavía no lo tiene. */
export async function bodegaDelSitio(tx: Db, ubicacionId: string) {
  const existente = await tx.bodega.findUnique({ where: { ubicacionId } });
  if (existente) return existente;
  const sitio = await tx.ubicacion.findUniqueOrThrow({ where: { id: ubicacionId }, select: { codigo: true, nombre: true, dimIdTienda: true } });
  let codigo = sitio.codigo;
  if (await tx.bodega.findUnique({ where: { codigo } })) codigo = `${sitio.codigo}-${sitio.dimIdTienda ?? ubicacionId.slice(0, 8)}`;
  return tx.bodega.create({ data: { codigo, nombre: sitio.nombre, ubicacionId } });
}

/** Sitio cuyo inventario leía PDMC antes de la 2b-2 (PDMC_INVENTARIO_DIM_ID, por defecto 2004). */
export async function sitioHeredado(tx: Db) {
  let dim: number;
  try { dim = dimInventario(); } catch { return null; }
  return tx.ubicacion.findFirst({ where: { dimIdTienda: dim, tipo: "BODEGA" }, select: { id: true, nombre: true, regionId: true } });
}

/** De qué sitio es cada registro de negativos: el suyo; la bodega general, del sitio heredado. */
export async function sitiosDeBodegas(tx: Db, bodegaIds: readonly string[]) {
  const bodegas = await tx.bodega.findMany({ where: { id: { in: [...bodegaIds] } }, select: { id: true, codigo: true, ubicacionId: true } });
  const heredado = bodegas.some(b => b.codigo === BODEGA_GENERAL) ? (await sitioHeredado(tx))?.id ?? null : null;
  return new Map(bodegas.map(b => [b.id, b.codigo === BODEGA_GENERAL ? heredado : b.ubicacionId]));
}

/**
 * Asigna los datos de antes de la 2b-2 (sin bodega) al sitio que entonces leía PDMC: cargas,
 * inventario vigente, fotografías y negativos de la bodega general. Idempotente: si no hay nada
 * sin asignar, no hace nada. Se ejecuta al iniciar el servidor y antes de cada carga de inventario.
 */
export async function adoptarInventarioHeredado(db: PrismaClient) {
  const pendientes = await db.consultaInventario.count({ where: { ubicacionId: null } }) + await db.fotoNegativos.count({ where: { ubicacionId: null } });
  const general = await db.bodega.findUnique({ where: { codigo: BODEGA_GENERAL }, select: { id: true } });
  const negativosGenerales = general ? await db.negativo.count({ where: { bodegaId: general.id } }) : 0;
  if (!pendientes && !negativosGenerales) return { asignado: false as const };
  const sitio = await sitioHeredado(db);
  if (!sitio) return { asignado: false as const, motivo: "El sitio PDMC_INVENTARIO_DIM_ID todavía no está en el catálogo de PDMC." };
  return db.$transaction(async tx => {
    const bodega = await bodegaDelSitio(tx, sitio.id);
    const consultas = (await tx.consultaInventario.updateMany({ where: { ubicacionId: null }, data: { ubicacionId: sitio.id } })).count;
    const inventario = (await tx.inventarioActual.updateMany({ where: { ubicacionId: null }, data: { ubicacionId: sitio.id } })).count;
    const fotos = (await tx.fotoNegativos.updateMany({ where: { ubicacionId: null }, data: { ubicacionId: sitio.id } })).count;
    let negativos = 0;
    if (general) {
      // Un producto con caso en las dos bodegas conserva el de la bodega real (no hay dos casos del mismo producto).
      const ocupados = new Set((await tx.negativo.findMany({ where: { bodegaId: bodega.id }, select: { productoId: true } })).map(caso => caso.productoId));
      const mover = (await tx.negativo.findMany({ where: { bodegaId: general.id }, select: { id: true, productoId: true } })).filter(caso => !ocupados.has(caso.productoId)).map(caso => caso.id);
      if (mover.length) negativos = (await tx.negativo.updateMany({ where: { id: { in: mover } }, data: { bodegaId: bodega.id } })).count;
    }
    if (consultas || inventario || fotos || negativos) await tx.auditoria.create({ data: { entidad: "Ubicacion", entidadId: sitio.id, accion: "INVENTARIO_ASIGNADO_A_BODEGA", origen: "SERVIDOR fase 2b-2", motivo: `Inventario y negativos anteriores asignados a ${sitio.nombre} (cada región tiene los suyos)`, valorNuevo: { consultas, inventario, fotos, negativos } } });
    return { asignado: true as const, sitio: sitio.nombre, consultas, inventario, fotos, negativos };
  }, { timeout: 600_000, maxWait: 30_000 });
}
