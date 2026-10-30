import test from "node:test";
import assert from "node:assert/strict";

// Zona horaria de las tiendas (UTC−4): es donde una fecha de calendario se corría un día.
process.env.TZ = "America/Caracas";
const { formatoFecha } = await import("../src/lib/fechas.ts");

test("una fecha de calendario se muestra como el día que es, también en Venezuela", () => {
  assert.match(formatoFecha("2026-10-30"), /^30 /);
  assert.match(formatoFecha("2026-11-01"), /^01 /);
  assert.match(formatoFecha("2026-01-01"), /2026$/);
});

test("las fechas con hora se siguen mostrando en la hora local", () => {
  assert.match(formatoFecha("2026-10-30T02:00:00.000Z"), /^29 /);
});

test("un valor que no es fecha se devuelve tal cual o con el texto de vacío", () => {
  assert.equal(formatoFecha("sin fecha"), "sin fecha");
  assert.equal(formatoFecha(""), "—");
});
