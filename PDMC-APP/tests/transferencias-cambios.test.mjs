import test from "node:test";
import assert from "node:assert/strict";
import { planCabeceras, planDetalles, sinCambiosEnPlan } from "../shared/consultas/cambios.ts";

const campos = ["fecha", "codigoFacturador", "tiendaId", "estado", "observacion", "unidades", "cantidadCodigos"];
const fuente = (numero, cambios = {}) => ({
  numero, fecha: new Date("2026-10-01T00:00:00Z"), codigoFacturador: "F1", tiendaId: null,
  estado: "Abierta", observacion: null, unidades: 10, cantidadCodigos: 2, ...cambios,
});
const guardada = (id, numero, cambios = {}) => ({ id, bajaEn: null, ...fuente(numero), ...cambios });
const linea = (numero, codigoBarra, numeroCaja, cantidad, extra = {}) => ({ numero, codigoBarra, numeroCaja, cantidad, productoId: null, ...extra });

test("cabeceras: inserta nuevas, actualiza modificadas y no toca las iguales", () => {
  const plan = planCabeceras([guardada("a", "1"), guardada("b", "2")], [fuente("1"), fuente("2", { estado: "Exportada" }), fuente("3")], campos);
  assert.deepEqual(plan.crear.map(row => row.numero), ["3"]);
  assert.deepEqual(plan.actualizar.map(row => [row.id, row.datos.estado]), [["b", "Exportada"]]);
  assert.deepEqual(plan.bajas, []);
  assert.equal(plan.sinCambios, 1);
});

test("cabeceras: baja lógica de la que desaparece y reactivación de la que vuelve", () => {
  const plan = planCabeceras(
    [guardada("a", "1"), guardada("b", "2"), guardada("c", "3", { bajaEn: new Date() })],
    [fuente("1"), fuente("3")], campos);
  assert.deepEqual(plan.bajas, ["b"]);
  assert.deepEqual(plan.actualizar.map(row => row.id), ["c"]);
});

test("cabeceras: detecta cambios de fecha y de tienda vinculada", () => {
  const plan = planCabeceras([guardada("a", "1"), guardada("b", "2")],
    [fuente("1", { fecha: new Date("2026-10-02T00:00:00Z") }), fuente("2", { tiendaId: "t1" })], campos);
  assert.deepEqual(plan.actualizar.map(row => row.id), ["a", "b"]);
});

test("detalle: inserta, actualiza cantidad y retira solo las líneas que ya no existen", () => {
  const guardados = [
    { id: "d1", ...linea("1", "111", "C1", 2) },
    { id: "d2", ...linea("1", "222", "C1", 5) },
    { id: "d3", ...linea("1", "333", "C2", 1) },
    { id: "d4", ...linea("9", "999", "C1", 1) }, // documento dado de baja: no se toca
  ];
  const plan = planDetalles(guardados, [linea("1", "111", "C1", 2), linea("1", "222", "C1", 6), linea("1", "444", "C2", 3)]);
  assert.deepEqual(plan.crear.map(row => row.codigoBarra), ["444"]);
  assert.deepEqual(plan.actualizar, [{ id: "d2", cantidad: 6, productoId: null }]);
  assert.deepEqual(plan.eliminar, ["d3"]);
});

test("sin cambios cuando cabeceras y detalle coinciden", () => {
  const cabeceras = planCabeceras([guardada("a", "1")], [fuente("1")], campos);
  const detalles = planDetalles([{ id: "d1", ...linea("1", "111", "C1", 2) }], [linea("1", "111", "C1", 2)]);
  assert.equal(sinCambiosEnPlan(cabeceras, detalles), true);
});
