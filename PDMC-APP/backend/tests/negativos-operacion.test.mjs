import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/http/operacion/negativos/[...path]/route.ts";
import { estados, gruposEstado, grupoEstado } from "@pdmc/contratos/negativos/model";
test("todos los estados anteriores pertenecen a un único grupo visible", () => {
  const mapped = Object.values(gruposEstado).flatMap(g=>g.estados);
  assert.equal(new Set(mapped).size,mapped.length);
  assert.deepEqual([...mapped].sort(),Object.keys(estados).sort());
  assert.equal(grupoEstado("ESPERANDO_DECISION"),"EN_INVESTIGACION");
  assert.equal(grupoEstado("PENDIENTE_VERIFICAR"),"EN_INVESTIGACION");
  assert.equal(grupoEstado("CERRADO_SIN_AJUSTE"),"SOLUCIONADO");
});
import { productCode, quantityText } from "@pdmc/contratos/negativos/presentation";
import { bulkSchema } from "../src/negativos/operations.ts";
test("edición masiva exige cambios explícitos y valida motivo y ajuste", () => {
  const casos = [{id:"11111111-1111-4111-8111-111111111111",version:1}];
  assert.equal(bulkSchema.safeParse({casos}).success,false);
  assert.equal(bulkSchema.safeParse({casos,motivo:"  "}).success,false);
  assert.equal(bulkSchema.safeParse({casos,numeroAjuste:"a".repeat(129)}).success,false);
  assert.deepEqual(bulkSchema.parse({casos,motivo:" Común ",numeroAjuste:" AJ-01 "}),{casos,motivo:"Común",numeroAjuste:"AJ-01"});
});
test("presentación limpia código Excel, conserva ceros y muestra unidades enteras", () => {
  assert.equal(productCode('="5029900049266"'), "5029900049266");
  assert.equal(productCode('="0000123"'), "0000123");
  assert.equal(productCode("ABC-01"), "ABC-01");
  assert.equal(quantityText("-12.0000"), "-12");
  assert.equal(quantityText("0.0000"), "0");
  assert.equal(quantityText(null, "Pendiente"), "Pendiente");
});
test("interfaz no requiere token pero rechaza escrituras ajenas al origen",()=>{
  assert.doesNotThrow(()=>sameOrigin(new Request("http://localhost:3000/api/operacion/negativos/lista")));
  assert.throws(()=>sameOrigin(new Request("http://localhost:3000/x",{method:"POST",headers:{origin:"https://ajeno.test"}})),{status:403});
  assert.throws(()=>sameOrigin(new Request("http://localhost:3000/x",{method:"POST"})),{status:403});
  assert.doesNotThrow(()=>sameOrigin(new Request("http://localhost:3000/x",{method:"POST",headers:{origin:"http://localhost:3000"}})));
  assert.throws(()=>sameOrigin(new Request("http://localhost:3000/x",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000"}})),{status:403});
});
