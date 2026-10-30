import {test} from "node:test";
import assert from "node:assert/strict";
import {addBusinessDays,businessDaysBetween,canonicalStoreName,parseOperationalDate,STORE_REPORT_REASONS,STORE_REPORT_SUBREASONS,UNKNOWN_BARCODE_REASONS,transferDeadline} from "../src/tienda/model.ts";
import {allows,hasPermission} from "../src/auth/permissions.ts";

const storeGrant={rol:"TIENDA",ubicacionId:"tienda-a",ubicacion:{tipo:"TIENDA"}};

test("el catálogo de motivos es cerrado y no repite valores",()=>{
  assert.deepEqual(STORE_REPORT_REASONS.map(([value])=>value),["FALTANTE","SOBRANTE","CRUCE","DANADO","VENCIDO","OTRO"]);
  assert.equal(new Set(STORE_REPORT_REASONS.map(([value])=>value)).size,6);
});

test("submotivos y causas de código desconocido son catálogos cerrados",()=>{
  assert.deepEqual(STORE_REPORT_SUBREASONS.SOBRANTE.map(([value])=>value),["UNIDADES_MAS_PAQUETE","NO_ESTA_TRANSFERENCIA"]);
  assert.deepEqual(STORE_REPORT_SUBREASONS.FALTANTE.map(([value])=>value),["UNIDADES_MENOS_PAQUETE","NO_ESTA_FISICO"]);
  assert.deepEqual(UNKNOWN_BARCODE_REASONS.map(([value])=>value),["CODIGO_MEZCLADO_PAQUETE","OTRA_PRENDA","OTRO"]);
});

test("normaliza el nombre operativo de la tienda sin depender del encargado",()=>{
  assert.equal(canonicalStoreName("C.C. CARIBE ZULIA (HECTOR YARCE)"),"c c caribe zulia");
  assert.equal(canonicalStoreName("  C.C Caribe-Zulia  "),"c c caribe zulia");
});

test("valida fechas operativas y calcula cinco días hábiles sin fines de semana",()=>{
  assert.equal(parseOperationalDate("2026-09-18")?.toISOString(),"2026-09-18T00:00:00.000Z");
  assert.equal(parseOperationalDate("18/09/2026")?.toISOString(),"2026-09-18T00:00:00.000Z");
  assert.equal(parseOperationalDate("31/02/2026"),null);
  const friday=new Date("2026-09-18T00:00:00.000Z");
  assert.equal(addBusinessDays(friday,5).toISOString(),"2026-09-25T00:00:00.000Z");
  assert.equal(businessDaysBetween(friday,new Date("2026-09-21T00:00:00.000Z")),1);
  assert.deepEqual(transferDeadline("2026-09-18",new Date("2026-09-24T12:00:00Z")),{deadline:new Date("2026-09-25T00:00:00.000Z"),remaining:1,status:"MANANA"});
  assert.equal(transferDeadline("",new Date()),null);
});

test("Tienda obtiene los permisos del módulo solamente dentro de su alcance",()=>{
  assert.equal(hasPermission([storeGrant],"tienda.panel"),true);
  assert.equal(hasPermission([storeGrant],"inconsistencias.reportar"),true);
  assert.equal(allows([storeGrant],"inconsistencias.reportar",{id:"tienda-a",regionId:null}),true);
  assert.equal(allows([storeGrant],"inconsistencias.reportar",{id:"tienda-b",regionId:null}),false);
});
