import test from "node:test";
import assert from "node:assert/strict";
import {FORMAS_CORRECCION,MOTIVOS,TIPOS_AJUSTE,TIPOS_ERROR,VEREDICTOS} from "../../shared/inconsistencias/options.ts";
import {permissionMatrix} from "../../shared/auth/permissions.ts";

test("las listas de PDMC usan causas y acciones operativas concisas",()=>{
  assert.deepEqual(TIPOS_AJUSTE,["Positivo","Negativo"]);
  assert.ok(TIPOS_ERROR.includes("Faltante físico"));
  assert.ok(TIPOS_ERROR.includes("Sobrante físico"));
  assert.ok(MOTIVOS.includes("Diferencia de conteo confirmada"));
  assert.ok(FORMAS_CORRECCION.includes("Ajuste de inventario"));
  assert.deepEqual(VEREDICTOS,["AJUSTE POSITIVO POR SOBRANTE FÍSICO CONFIRMADO","AJUSTE NEGATIVO POR FALTANTE FÍSICO CONFIRMADO"]);
  for(const options of [TIPOS_ERROR,MOTIVOS,FORMAS_CORRECCION,TIPOS_AJUSTE,VEREDICTOS])assert.equal(new Set(options).size,options.length);
});

test("inconsistencias separa lectura, edición y conteo por permisos",()=>{
  assert.ok(permissionMatrix.MEJORA_CONTINUA.includes("inconsistencias.editar"));
  assert.ok(permissionMatrix.AUDITORIA.includes("inconsistencias.leer"));
  assert.ok(!permissionMatrix.AUDITORIA.includes("inconsistencias.editar"));
  assert.ok(permissionMatrix.RECTIFICACION.includes("inconsistencias.leer"));
  assert.ok(permissionMatrix.RECTIFICACION.includes("inconsistencias.conteo"));
  assert.ok(!permissionMatrix.RECTIFICACION.includes("inconsistencias.editar"));
});
