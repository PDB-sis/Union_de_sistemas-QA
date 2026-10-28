import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "../../backend/src/negativos/comparator.ts";
import { parseDate, validateFile, importInput } from "../../backend/src/negativos/validation.ts";
import { jsonBody, pagination } from "../../backend/src/negativos/http.ts";

const header = "Estado;CodigoBarra;Referencia;Talla;NombreMarca;CodigoMarca;Descripcion;Existencia;CategoriaNombre;Linea";
const row = (code, amount) => `Activo;${code};R;M;Marca;01;Descripción;${amount};C;L`;
const date = new Date("2025-01-01");

test("normaliza código Excel antes de comparar identidad y detectar duplicados",()=>{
  const result=validateFile(`${header}\n${row('="0000123"',"-2")}`,date);
  assert.equal(result.rows[0].codigoBarra,"0000123");
  assert.equal(result.rows[0].originales.CodigoBarra,'="0000123"');
  const duplicate=validateFile(`${header}\n${row('="0000123"',"-2")}\n${row('0000123',"-4")}`,date);
  assert.equal(duplicate.summary.rechazados,2);assert.equal(duplicate.rows.length,0);
});

test("comparador: cinco resultados y decimales exactos", () => {
  assert.equal(compare(null, "-1"), "Nuevo");
  assert.equal(compare("-1", null), "Desapareció");
  assert.equal(compare("-1.0000", "-1"), "Sin cambio");
  assert.equal(compare("-2", "-1"), "Mejoró");
  assert.equal(compare("-1", "-2"), "Empeoró");
  assert.equal(compare("-99999999999999.9999", "-99999999999999.9998"), "Mejoró");
  assert.equal(compare("-0.0002", "-0.0001"), "Mejoró");
});
test("valida CSV/TXT, BOM, ceros iniciales, coma decimal y comillas", () => {
  const { rows, summary } = validateFile(`\uFEFF${header}\r\n${row("0000123", "-2,5").replace("Descripción", '"Texto; con ""comillas""\ny salto"')}`, date);
  assert.equal(summary.rechazados, 0);
  assert.equal(rows[0].codigoBarra, "0000123");
  assert.equal(rows[0].existencia, "-2.5");
  assert.equal(rows[0].originales.Descripcion, 'Texto; con "comillas"\ny salto');
  for (const delimiter of [",", "\t"]) assert.equal(validateFile(`${header}\n${row("01", "-2")}`.replaceAll(";", delimiter), date).rows.length, 1);
});
test("rechaza encabezados ausentes, duplicados y comillas sin cerrar", () => {
  for (const content of ["", "CodigoBarra;Existencia", `${header};Estado`, `${header}\n"sin cerrar`]) assert.throws(() => validateFile(content, date));
});
test("cantidades, límites y duplicados reportan cada fila inválida", () => {
  for (const amount of ["0", "-0.0000", "1", "", "NaN", "-1e3", "-1.00001", "-100000000000000", "-1,000.00"])
    assert.equal(validateFile(`${header}\n${row("01", amount)}`, date).summary.rechazados, 1, amount);
  const report = validateFile(`${header}\n${row("01", "-1")}\n${row("01", "-2")}\n${row("02", "-3")}`, date);
  assert.deepEqual(report.summary.errores.map(e => e.fila), [2, 3]);
  assert.equal(report.summary.aceptados, 1);
  assert.equal(report.summary.importados, 0);
  assert.equal(validateFile(`${header}\n${row("03", "-1")};extra`, date).summary.rechazados, 1);
});
test("fechas estrictas: calendario, futuro, año y consistencia por fila", () => {
  for (const value of ["2025-02-29", "2025-04-31", "2019-01-01", "9999-01-01", "01/02/2025", "2025-01-01T24:00:00Z", "2025-01-01T12:00:00"])
    assert.throws(() => parseDate(value));
  assert.equal(parseDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.throws(() => parseDate("2025-01-02", date));
  const content = `${header};FechaConsulta\n${row("01", "-1")};2025-01-02`;
  assert.equal(validateFile(content, date).summary.errores[0].campo, "FechaConsulta");
});
test("consulta vacía explícita válida; identidad y límites de API", () => {
  assert.equal(validateFile(header, date).rows.length, 0);
  assert.throws(() => importInput.parse({ bodegaId: "no-uuid" }));
  assert.throws(() => pagination.parse({ bodegaId: "00000000-0000-4000-8000-000000000000", take: 101 }));
  assert.throws(() => validateFile("x".repeat(2_000_001), date));
});
test("una fila con columnas vacías se rechaza y no equivale a consulta vacía", () => {
  for (const emptyRow of [";;;;;;;;;", '"";"";"";"";"";"";"";"";"";""', '""']) {
    for (const ending of ["", "\n", "\r\n"]) {
      const result = validateFile(`${header}\n${emptyRow}${ending}`, date);
      assert.equal(result.summary.rechazados, 1);
      assert.ok(result.summary.errores.some(error => error.fila === 2 && error.campo === "CodigoBarra"));
      assert.ok(result.summary.errores.some(error => error.fila === 2 && error.campo === "Existencia"));
    }
  }
  assert.equal(validateFile(`${header}\n\n   \n`, date).summary.rechazados, 0);
});
test("la API valida JSON sin depender de credenciales técnicas heredadas", async () => {
  await assert.rejects(jsonBody(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), { status: 400 });
});
