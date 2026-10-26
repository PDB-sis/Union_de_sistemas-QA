import test from "node:test";
import assert from "node:assert/strict";
import {closureIssue,inconsistencyStage} from "../shared/inconsistencias/workflow.ts";
const base={resuelto:false,conteoFisico:null,ajustado:false,formaCorreccion:null,numeroAjuste:null,unidadesSinResolver:0};
test("cada inconsistencia tiene una siguiente acción inequívoca",()=>{
  assert.equal(inconsistencyStage(base),"pendientes");
  assert.equal(inconsistencyStage({...base,conteoFisico:0}),"gestion");
  assert.equal(inconsistencyStage({...base,conteoFisico:0,formaCorreccion:"Ajuste de inventario"}),"corregir");
  assert.equal(inconsistencyStage({...base,conteoFisico:0,ajustado:true}),"verificar");
  assert.equal(inconsistencyStage({...base,resuelto:true}),"cerrados");
});
test("el cierre requiere conteo, corrección ejecutada y ninguna unidad pendiente",()=>{
  assert.ok(closureIssue({...base,resuelto:true}));
  const counted={...base,resuelto:true,conteoFisico:0};
  assert.ok(closureIssue({...counted,unidadesSinResolver:1}));
  assert.ok(closureIssue({...counted,formaCorreccion:"Pendiente de acción externa"}));
  assert.ok(closureIssue({...counted,formaCorreccion:"Ajuste de inventario"}));
  assert.equal(closureIssue({...counted,formaCorreccion:"Ajuste de inventario",ajustado:true,numeroAjuste:"AJ-1"}),null);
  assert.equal(closureIssue({...counted,formaCorreccion:"Corrección de transferencia"}),null);
});
