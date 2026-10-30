// Fechas de calendario (AAAA-MM-DD, sin hora), como la fecha de una transferencia o devolución.
// new Date("2026-10-30") las lee como medianoche UTC y, mostradas en Venezuela (UTC−4),
// aparecen un día antes. Aquí se leen y se muestran como el día que son, en cualquier zona horaria.
const CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha corta en español ("30 oct 2026"). Acepta AAAA-MM-DD o una fecha con hora (ISO). */
export function formatoFecha(valor: string, vacio = "—") {
  const civil = CALENDARIO.exec(valor);
  const fecha = civil ? new Date(Date.UTC(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3]))) : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor || vacio;
  return fecha.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", ...(civil ? { timeZone: "UTC" } : {}) });
}
