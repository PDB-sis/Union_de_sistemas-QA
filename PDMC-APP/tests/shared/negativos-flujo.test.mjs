import test from "node:test";
import assert from "node:assert/strict";
import {destinosNegativo,etapaNegativo,validarCambioNegativo,verificarAjusteNegativo} from "../../shared/negativos/flujo.ts";

const cambio=(antes,despues)=>validarCambioNegativo({antes:{conteoFisico:null,...antes},despues:{conteoFisico:antes.conteoFisico??null,motivo:"",numeroAjuste:"",observaciones:"",...despues}});

test("cada estado pertenece a una etapa de la ruta Contar → Solucionado",()=>{
  assert.equal(etapaNegativo("NUEVO",false),"CONTAR");
  assert.equal(etapaNegativo("EN_INVESTIGACION",true),"INVESTIGAR");
  assert.equal(etapaNegativo("AJUSTE_AUTORIZADO",true),"CORREGIR");
  assert.equal(etapaNegativo("AJUSTE_REALIZADO",true),"VERIFICAR");
  assert.equal(etapaNegativo("PENDIENTE_VERIFICAR",false),"VERIFICAR");
  assert.equal(etapaNegativo("CERRADO_SIN_AJUSTE",true),"SOLUCIONADO");
});

test("la investigación no salta directamente a Solucionado",()=>{
  assert.ok(!destinosNegativo("EN_INVESTIGACION",true).includes("SOLUCIONADO"));
  assert.match(cambio({estado:"EN_INVESTIGACION",conteoFisico:"0"},{estado:"SOLUCIONADO",motivo:"ROTACION"}),/etapa/);
  assert.ok(!destinosNegativo("NUEVO",false).includes("AJUSTE_AUTORIZADO"));
  assert.ok(destinosNegativo("SOLUCIONADO",true).every(estado=>["SOLUCIONADO","REABIERTO"].includes(estado)));
});

test("aprobar un ajuste exige conteo y una causa del catálogo",()=>{
  assert.match(cambio({estado:"EN_INVESTIGACION",conteoFisico:"0"},{estado:"AJUSTE_AUTORIZADO"}),/causa/);
  assert.match(cambio({estado:"EN_INVESTIGACION",conteoFisico:"0"},{estado:"AJUSTE_AUTORIZADO",motivo:"texto libre"}),/causa/);
  assert.equal(cambio({estado:"EN_INVESTIGACION",conteoFisico:"0"},{estado:"AJUSTE_AUTORIZADO",motivo:"ROTACION"}),null);
  assert.match(cambio({estado:"AJUSTE_AUTORIZADO",conteoFisico:"0"},{estado:"AJUSTE_REALIZADO",motivo:"ROTACION"}),/número de ajuste/);
  assert.equal(cambio({estado:"AJUSTE_AUTORIZADO",conteoFisico:"0"},{estado:"AJUSTE_REALIZADO",motivo:"ROTACION",numeroAjuste:"AJ-9"}),null);
});

test("reabrir y cerrar sin corrección exigen explicación",()=>{
  assert.match(cambio({estado:"SOLUCIONADO",conteoFisico:"0"},{estado:"REABIERTO"}),/observaciones/);
  assert.equal(cambio({estado:"SOLUCIONADO",conteoFisico:"0"},{estado:"REABIERTO",observaciones:"Volvió a faltar"}),null);
  assert.match(cambio({estado:"PENDIENTE_VERIFICAR"},{estado:"SOLUCIONADO"}),/documente la causa/);
  assert.match(cambio({estado:"EN_INVESTIGACION",conteoFisico:"0"},{estado:"CERRADO_SIN_AJUSTE"}),/causa/);
});

test("un ajuste solo se cierra con inventario posterior y sin existencia negativa",()=>{
  const ajusteAt=new Date("2026-10-20T10:00:00Z");
  assert.equal(verificarAjusteNegativo({ajusteAt,inventarioAt:null,existencia:null}).puedeCerrar,false);
  assert.match(verificarAjusteNegativo({ajusteAt,inventarioAt:new Date("2026-10-20T09:00:00Z"),existencia:"0"}).mensaje,/anterior al ajuste/);
  assert.match(verificarAjusteNegativo({ajusteAt,inventarioAt:new Date("2026-10-21T09:00:00Z"),existencia:"-3.0000"}).mensaje,/Sigue en -3/);
  assert.equal(verificarAjusteNegativo({ajusteAt,inventarioAt:new Date("2026-10-21T09:00:00Z"),existencia:"0.0000"}).puedeCerrar,true);
  assert.equal(verificarAjusteNegativo({ajusteAt,inventarioAt:new Date("2026-10-21T09:00:00Z"),existencia:null}).puedeCerrar,true);
});
