import test from "node:test";
import assert from "node:assert/strict";
import {closureIssue,inconsistencyStage,sinCorreccionIssue,unidadesPendientes} from "../src/inconsistencias/workflow.ts";
const base={resuelto:false,conteoFisico:null,ajustado:false,formaCorreccion:null,numeroAjuste:null,unidadesSinResolver:0};
test("cada inconsistencia tiene una siguiente acción inequívoca",()=>{
  assert.equal(inconsistencyStage(base),"pendientes");
  assert.equal(inconsistencyStage({...base,conteoFisico:0}),"gestion");
  assert.equal(inconsistencyStage({...base,conteoFisico:0,formaCorreccion:"Ajuste de inventario"}),"corregir");
  assert.equal(inconsistencyStage({...base,conteoFisico:0,ajustado:true}),"verificar");
  assert.equal(inconsistencyStage({...base,resuelto:true}),"cerrados");
});
test("toda corrección registrada pasa por verificación, no solo el ajuste",()=>{
  const corrigiendo={...base,conteoFisico:0,formaCorreccion:"Corrección de transferencia"};
  assert.equal(inconsistencyStage(corrigiendo),"corregir");
  assert.equal(inconsistencyStage({...corrigiendo,correccionEjecutada:true}),"verificar");
  assert.equal(inconsistencyStage({...base,conteoFisico:0,formaCorreccion:"Sin corrección: inventario correcto"}),"verificar");
});
test("sin corrección solo se admite si el conteo coincide con el sistema",()=>{
  assert.equal(sinCorreccionIssue("Sin corrección: inventario correcto",0),null);
  assert.match(sinCorreccionIssue("Sin corrección: inventario correcto",2),/2 unidades de diferencia/);
  assert.equal(sinCorreccionIssue("Corrección de transferencia",2),null);
  assert.equal(sinCorreccionIssue(null,2),null);
});
test("las unidades pendientes se calculan con el conteo y lo corregido",()=>{
  assert.equal(unidadesPendientes({conteoFisico:7,existenciaSistemaConteo:10,unidadesAjustadas:0,unidadesSinResolver:0}),3);
  assert.equal(unidadesPendientes({conteoFisico:7,existenciaSistemaConteo:10,unidadesAjustadas:3,unidadesSinResolver:0}),0);
  assert.equal(unidadesPendientes({conteoFisico:null,existenciaSistemaConteo:null,cantidadErrada:4,unidadesAjustadas:1,unidadesSinResolver:0}),3);
  assert.equal(unidadesPendientes({conteoFisico:12,existenciaSistemaConteo:10,unidadesAjustadas:5,unidadesSinResolver:0}),0);
});
test("el cierre requiere conteo, responsable, corrección ejecutada y ninguna unidad pendiente",()=>{
  assert.ok(closureIssue({...base,resuelto:true}));
  const counted={...base,resuelto:true,conteoFisico:0,responsable:"BODEGA"};
  assert.ok(closureIssue({...counted,unidadesSinResolver:1,formaCorreccion:"Sin corrección: inventario correcto"}));
  assert.ok(closureIssue({...counted,formaCorreccion:"Pendiente de acción externa"}));
  assert.ok(closureIssue({...counted,formaCorreccion:"Ajuste de inventario"}));
  assert.equal(closureIssue({...counted,formaCorreccion:"Ajuste de inventario",ajustado:true,numeroAjuste:"AJ-1"}),null);
  assert.match(closureIssue({...counted,formaCorreccion:"Corrección de transferencia"}),/corrección ejecutada/);
  assert.match(closureIssue({...counted,formaCorreccion:"Corrección de transferencia",correccionEjecutada:true}),/número/);
  assert.equal(closureIssue({...counted,formaCorreccion:"Corrección de transferencia",correccionEjecutada:true,numeroCorreccion:"81880"}),null);
  assert.match(closureIssue({...counted,responsable:"SIN_DETERMINAR",formaCorreccion:"Ajuste de inventario",ajustado:true,numeroAjuste:"AJ-1"}),/responsable/);
  assert.equal(closureIssue({...counted,responsable:"SIN_DETERMINAR",formaCorreccion:"Sin corrección: inventario correcto",existenciaSistemaConteo:0}),null);
  assert.match(closureIssue({...counted,formaCorreccion:"Sin corrección: inventario correcto",existenciaSistemaConteo:2}),/2 unidades sin resolver/);
  assert.ok(closureIssue({...counted,formaCorreccion:null}));
});
