// Convierte el resultado de una consulta SQL Server en el mismo CSV que hoy se
// exporta manualmente, para pasarlo sin cambios a las importaciones existentes.

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    // Las importaciones aceptan hasta 4 decimales y rechazan notación científica.
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function quote(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}

/**
 * Las filas se ordenan para que el mismo resultado produzca siempre el mismo
 * contenido (y el mismo hash), aunque SQL Server devuelva empates en otro orden.
 */
export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const header = columns.map(quote).join(",");
  const lines = rows.map(row => columns.map(column => quote(formatValue(row[column]))).join(","));
  lines.sort();
  return [header, ...lines].join("\r\n") + "\r\n";
}
