import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../backend/src/sync/csv.ts";
import { parseDelimitedTable } from "../backend/src/negativos/validation.ts";

test("el CSV generado desde SQL Server se lee igual que el exportado manualmente", () => {
  const csv = toCsv(["numero", "observacion", "suma_cantidades"], [
    { numero: 2, observacion: 'Dice "urgente", revisar\nhoy', suma_cantidades: 12 },
    { numero: 1, observacion: null, suma_cantidades: 3.5 },
  ]);
  const [header, ...rows] = parseDelimitedTable(csv);
  assert.deepEqual(header.cells, ["numero", "observacion", "suma_cantidades"]);
  assert.deepEqual(rows.map(row => row.cells), [
    ["1", "", "3.5"],
    ["2", 'Dice "urgente", revisar\nhoy', "12"],
  ]);
});

test("el mismo resultado produce el mismo CSV aunque cambie el orden", () => {
  const a = { CodigoBarra: "A", Existencia: -2 }, b = { CodigoBarra: "B", Existencia: 1.25 };
  assert.equal(toCsv(["CodigoBarra", "Existencia"], [a, b]), toCsv(["CodigoBarra", "Existencia"], [b, a]));
});

test("formatea cantidades sin notacion cientifica y con hasta 4 decimales", () => {
  const csv = toCsv(["x"], [{ x: 0.1 + 0.2 }, { x: 12345678901234 }, { x: true }]);
  assert.match(csv, /"0\.3"/);
  assert.match(csv, /"12345678901234"/);
  assert.match(csv, /"1"/);
});
