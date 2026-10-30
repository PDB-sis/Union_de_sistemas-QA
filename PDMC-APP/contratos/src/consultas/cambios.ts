// Compara el resultado de una consulta de SQL Server con lo guardado en
// PostgreSQL para aplicar solo INSERT, UPDATE y bajas lógicas en las cabeceras,
// y altas, cambios y retiros puntuales en su detalle por producto y caja.

type Valor = string | number | Date | null | undefined;

export type PlanCabeceras<T> = {
  crear: T[];
  actualizar: { id: string; datos: T }[];
  /** Ids que ya no aparecen en la consulta y siguen activos. */
  bajas: string[];
  sinCambios: number;
};

function igual(a: Valor, b: Valor) {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  return (a ?? null) === (b ?? null);
}

export function planCabeceras<T extends { numero: string }>(
  guardadas: readonly (Record<keyof T, unknown> & { id: string; numero: string; bajaEn: Date | null })[],
  fuente: readonly T[],
  campos: readonly (keyof T)[],
): PlanCabeceras<T> {
  const porNumero = new Map(guardadas.map(row => [row.numero, row]));
  const plan: PlanCabeceras<T> = { crear: [], actualizar: [], bajas: [], sinCambios: 0 };
  const vistos = new Set<string>();
  for (const row of fuente) {
    vistos.add(row.numero);
    const actual = porNumero.get(row.numero);
    if (!actual) plan.crear.push(row);
    // Una baja que vuelve a aparecer se reactiva.
    else if (actual.bajaEn || campos.some(campo => !igual(actual[campo] as Valor, row[campo] as Valor))) plan.actualizar.push({ id: actual.id, datos: row });
    else plan.sinCambios++;
  }
  for (const row of guardadas) if (!vistos.has(row.numero) && !row.bajaEn) plan.bajas.push(row.id);
  return plan;
}

export type DetalleFuente = { numero: string; codigoBarra: string; numeroCaja: string; cantidad: number; productoId: string | null };
export type DetalleGuardado = DetalleFuente & { id: string };

export type PlanDetalles = {
  crear: DetalleFuente[];
  actualizar: { id: string; cantidad: number; productoId: string | null }[];
  /** Líneas que ya no existen en SQL Server para documentos vigentes. */
  eliminar: string[];
};

const clave = (row: Pick<DetalleFuente, "numero" | "codigoBarra" | "numeroCaja">) => `${row.numero}\u0000${row.codigoBarra}\u0000${row.numeroCaja}`;

/**
 * Compara el detalle de los documentos presentes en la consulta. El detalle de
 * los documentos dados de baja no se toca: se conserva junto a su cabecera.
 */
export function planDetalles(guardados: readonly DetalleGuardado[], fuente: readonly DetalleFuente[]): PlanDetalles {
  const vigentes = new Set(fuente.map(row => row.numero));
  const actuales = new Map(guardados.filter(row => vigentes.has(row.numero)).map(row => [clave(row), row]));
  const plan: PlanDetalles = { crear: [], actualizar: [], eliminar: [] };
  for (const row of fuente) {
    const actual = actuales.get(clave(row));
    if (!actual) plan.crear.push(row);
    else {
      actuales.delete(clave(row));
      if (actual.cantidad !== row.cantidad || actual.productoId !== row.productoId) plan.actualizar.push({ id: actual.id, cantidad: row.cantidad, productoId: row.productoId });
    }
  }
  plan.eliminar = [...actuales.values()].map(row => row.id);
  return plan;
}

export const sinCambiosEnPlan = (cabeceras: PlanCabeceras<unknown>, detalles: PlanDetalles) =>
  !cabeceras.crear.length && !cabeceras.actualizar.length && !cabeceras.bajas.length
  && !detalles.crear.length && !detalles.actualizar.length && !detalles.eliminar.length;
