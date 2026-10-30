import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { toCsv } from "./csv";

// Regla del proyecto: PDMC solo lee de PostgreSQL. Transferencias, devoluciones y
// facturadores llegan de los agentes de cada bodega a <esquema CYSN>.agente_fila
// (por dimID_Tienda, tarea y clave) y aquí se convierten en el mismo CSV que
// esperan los importadores, una carga por bodega.

export type TareaAgente = "transferencias" | "devoluciones" | "usuarios";
export type CargaSitio = { dimIdTienda: number; ubicacionId: string; nombre: string; csv: string; filas: number };

function esquemaAgente() {
  const esquema = (process.env.PDMC_AGENTE_SCHEMA ?? "cysn_qa").trim();
  if (!/^[a-z_][a-z0-9_]*$/.test(esquema)) throw new Error("PDMC_AGENTE_SCHEMA debe ser un identificador PostgreSQL válido.");
  return esquema;
}

async function consultar<T>(db: PrismaClient, sql: string, ...params: unknown[]) {
  try {
    return await db.$queryRawUnsafe<T[]>(sql, ...params);
  } catch (error) {
    const tabla = ["agente_fila", "inventario_agente_actual"].find(t => String(error).includes(t));
    if (tabla) throw new Error(`No se pudo leer "${esquemaAgente()}".${tabla}: compruebe las migraciones de CYSN (005 y 006) y PDMC_AGENTE_SCHEMA.`);
    throw error;
  }
}

/**
 * Huella barata de lo recibido de cada bodega. Cambia con cada alta, cambio o baja,
 * porque el agente actualiza recibido_at. Si es igual a la última, no se relee nada.
 */
export async function firmaAgente(db: PrismaClient, tarea: TareaAgente) {
  const filas = await consultar<{ dim: number; activas: bigint; ultimo: Date | null }>(db,
    `SELECT dim_id_tienda AS dim, count(*) FILTER (WHERE activo) AS activas, max(recibido_at) AS ultimo
       FROM "${esquemaAgente()}".agente_fila WHERE tarea = $1 GROUP BY dim_id_tienda ORDER BY dim_id_tienda`, tarea);
  const resumen = filas.map(f => [f.dim, String(f.activas), f.ultimo?.toISOString() ?? null]);
  return { firma: createHash("sha256").update(JSON.stringify([tarea, resumen])).digest("hex"), filas: filas.reduce((n, f) => n + Number(f.activas), 0) };
}

// --- Inventario (fase 2b-1) ---------------------------------------------------------------
// El inventario de PDMC sigue siendo uno solo: se alimenta del inventario que envía el agente
// de UN sitio (PDMC_INVENTARIO_DIM_ID, por defecto la bodega MARACAIBO). El inventario por cada
// sitio es la fase 2b-2. Solo se toman productos ACTIVOS (decisión revisable del 2026-10-26; ver PLAN-agente-multisitio.md, fase 2): un inactivo
// con existencia negativa no aparece en Negativos. Para incluirlos, el agente tendría que enviarlos.

export const COLUMNAS_INVENTARIO = ["Estado", "CodigoBarra", "Referencia", "Descripcion", "Existencia", "Categoria", "Linea", "Marca"] as const;

export function dimInventario() {
  const valor = Number((process.env.PDMC_INVENTARIO_DIM_ID ?? "2004").trim());
  if (!Number.isInteger(valor) || valor <= 0) throw new Error("PDMC_INVENTARIO_DIM_ID debe ser el dimID_Tienda del sitio cuyo inventario usa PDMC.");
  return valor;
}

// Como la consulta de SQL Server anterior (inventario.sql), solo entran productos con categoría.
const VIGENTE = "activo AND nombre_categoria IS NOT NULL";

export async function firmaInventario(db: PrismaClient) {
  const dim = dimInventario();
  const [fila] = await consultar<{ activas: bigint; ultimo: Date | null }>(db,
    `SELECT count(*) FILTER (WHERE ${VIGENTE}) AS activas, max(recibido_at) AS ultimo
       FROM "${esquemaAgente()}".inventario_agente_actual WHERE dim_id_tienda = $1`, dim);
  return {
    dim,
    firma: createHash("sha256").update(JSON.stringify(["inventario", dim, String(fila?.activas ?? 0), fila?.ultimo?.toISOString() ?? null])).digest("hex"),
    filas: Number(fila?.activas ?? 0),
  };
}

export async function cargaInventario(db: PrismaClient) {
  const dim = dimInventario();
  const filas = await consultar<{ codigo_barra: string; referencia: string | null; descripcion: string | null; existencia: string | null; nombre_categoria: string | null; linea: string | null; marca: string | null }>(db,
    `SELECT codigo_barra, referencia, descripcion, existencia::text AS existencia, nombre_categoria, linea, marca
       FROM "${esquemaAgente()}".inventario_agente_actual WHERE dim_id_tienda = $1 AND ${VIGENTE}`, dim);
  if (!filas.length) throw new Error(`El agente del sitio ${dim} no ha enviado inventario con productos activos (PDMC_INVENTARIO_DIM_ID).`);
  const csv = toCsv(COLUMNAS_INVENTARIO, filas.map(f => ({
    Estado: "1", CodigoBarra: f.codigo_barra, Referencia: f.referencia, Descripcion: f.descripcion,
    Existencia: f.existencia, Categoria: f.nombre_categoria, Linea: f.linea, Marca: f.marca,
  })));
  return { dim, csv, filas: filas.length };
}

/** Una carga por bodega con filas vigentes. La bodega debe estar en el catálogo de sitios (SUCURSALES). */
export async function cargasAgente(db: PrismaClient, tarea: TareaAgente, columnas: readonly string[]): Promise<CargaSitio[]> {
  const esquema = esquemaAgente();
  const sitios = await consultar<{ dim: number }>(db,
    `SELECT DISTINCT dim_id_tienda AS dim FROM "${esquema}".agente_fila WHERE tarea = $1 AND activo ORDER BY 1`, tarea);
  const cargas: CargaSitio[] = [];
  for (const { dim } of sitios) {
    const ubicacion = await db.ubicacion.findUnique({ where: { dimIdTienda: dim }, select: { id: true, nombre: true } });
    if (!ubicacion) throw new Error(`El sitio con dimID_Tienda ${dim} envía ${tarea} pero no está en el catálogo de PDMC: sincronice SUCURSALES.`);
    const datos = await consultar<{ datos: Record<string, string | null> }>(db,
      `SELECT datos FROM "${esquema}".agente_fila WHERE dim_id_tienda = $1 AND tarea = $2 AND activo`, dim, tarea);
    // Las columnas llegan con el nombre de la consulta; se toman sin distinguir mayúsculas.
    const filas = datos.map(({ datos: fila }) => {
      const porNombre = new Map(Object.entries(fila).map(([k, v]) => [k.toLowerCase(), v]));
      return Object.fromEntries(columnas.map(c => [c, porNombre.get(c.toLowerCase()) ?? null]));
    });
    cargas.push({ dimIdTienda: dim, ubicacionId: ubicacion.id, nombre: ubicacion.nombre, csv: toCsv(columnas, filas), filas: filas.length });
  }
  return cargas;
}
