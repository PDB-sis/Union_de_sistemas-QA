import type { Prisma, PrismaClient } from "../../generated/prisma/client";

// Línea de producto por bodega. Cada bodega reporta la Línea de sus productos en su consulta de
// inventario (InventarioActual.subcategoria) y puede ser distinta entre bodegas para el mismo código.
// Producto.linea es solo la última que llegó de cualquier bodega: se usa como respaldo cuando el
// producto ya no está en el inventario de la bodega (por ejemplo, un negativo que desapareció)
// o cuando la bodega no le reporta línea.

type Db = PrismaClient | Prisma.TransactionClient;
const igual = (linea: string) => ({ equals: linea, mode: "insensitive" as const });

/** Productos cuya línea, según el inventario de esos sitios, es `linea`. Sin sitios, la línea general. */
export function productoEnLinea(linea: string, sitios: readonly string[]): Prisma.ProductoWhereInput {
  if (!sitios.length) return { linea: igual(linea) };
  const enSitios = { ubicacionId: { in: [...sitios] } };
  return { OR: [
    { inventarios: { some: { ...enSitios, subcategoria: igual(linea) } } },
    // Respaldo: ninguna de esas bodegas reporta línea para el producto.
    { linea: igual(linea), inventarios: { none: { ...enSitios, subcategoria: { not: null } } } },
  ] };
}

/** Líneas que reportan esos sitios para los productos indicados, más la general de los que no están en su inventario. */
export async function lineasDisponibles(db: Db, sitios: readonly string[], productos: Prisma.ProductoWhereInput) {
  const enSitios = { ubicacionId: { in: [...sitios] } };
  const [deInventario, generales] = await Promise.all([
    sitios.length ? db.inventarioActual.findMany({ where: { ...enSitios, subcategoria: { not: null }, producto: productos }, distinct: ["subcategoria"], select: { subcategoria: true } }) : Promise.resolve([]),
    db.producto.findMany({ where: { AND: [productos, { linea: { not: null } }, ...(sitios.length ? [{ inventarios: { none: { ...enSitios, subcategoria: { not: null } } } }] : [])] }, distinct: ["linea"], select: { linea: true } }),
  ]);
  // Una sola opción por línea aunque cambien mayúsculas o espacios entre bodegas.
  const unicas = new Map<string, string>();
  for (const valor of [...deInventario.map(x => x.subcategoria), ...generales.map(x => x.linea)]) {
    const limpia = valor?.trim().replace(/\s+/g, " ");
    if (limpia && !unicas.has(limpia.toLocaleLowerCase("es"))) unicas.set(limpia.toLocaleLowerCase("es"), limpia);
  }
  return [...unicas.values()].sort((a, b) => a.localeCompare(b, "es"));
}
