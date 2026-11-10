import test from "node:test";
import assert from "node:assert/strict";
import {accionAuditoria,cambiosAuditoria,entidadAuditoria,origenAuditoria,valorAuditoria} from "../src/auditoria/catalogo.ts";

test("la auditoría se lee en lenguaje claro",()=>{
  assert.equal(accionAuditoria("LOGIN_EXITOSO").texto,"Inició sesión");
  assert.equal(accionAuditoria("IMPORTAR_CONSULTA_TRANSFERENCIAS").texto,"Actualizó las transferencias");
  assert.equal(accionAuditoria("ACCION_NUEVA_SIN_TRADUCIR").texto,"Accion nueva sin traducir");
  assert.equal(entidadAuditoria("TransferenciaConsultaImport"),"Carga de transferencias");
  assert.equal(entidadAuditoria("OtraEntidad"),"Otra entidad");
  assert.equal(origenAuditoria("WEB POST /api/auth/login"),"Web · Inicio de sesión");
  assert.equal(origenAuditoria("WEB PATCH /api/operacion/negativos/casos/bbf7d5ae-679c-49cf-aa0a-46ca6358ab1e"),"Web · Negativos");
  assert.equal(origenAuditoria("AGENTE sincronizacion"),"Sincronización automática (agente de la bodega)");
});

test("qué cambió: antes y después por campo, sin datos internos",()=>{
  const cambios=cambiosAuditoria({id:"x",estado:"NUEVO",conteoFisico:null,observaciones:"",version:3},{id:"x",estado:"EN_INVESTIGACION",conteoFisico:"12.0000",observaciones:"",version:4});
  assert.deepEqual(cambios.map(c=>[c.campo,c.antes,c.despues]),[["Estado","Nuevo","En investigación"],["Conteo físico","—","12"]]);
  // Sin valor anterior (una carga): se listan los datos registrados, incluidos los agrupados.
  const carga=cambiosAuditoria(null,{total:5,detalle:{insertadas:2,actualizadas:0}});
  assert.deepEqual(carga.map(c=>[c.campo,c.despues]),[["Total","5"],["Detalle · Nuevas","2"],["Detalle · Actualizadas","0"]]);
  assert.equal(valorAuditoria("rol","MEJORA_CONTINUA"),"Mejora Continua");
  assert.equal(valorAuditoria("activo",false),"No");
  assert.equal(valorAuditoria("bodegaProductoId","2d1b7a8e-1111-4222-8333-944455556666"),"Registro vinculado");
});
