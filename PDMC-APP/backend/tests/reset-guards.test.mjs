import test from "node:test";
import assert from "node:assert/strict";
import {enterApiRequest,resetMaintenance} from "../src/maintenance.ts";
test("el mantenimiento espera operaciones en curso y bloquea nuevas solicitudes",async()=>{
  const release1=enterApiRequest(),release2=enterApiRequest();
  try{await assert.rejects(resetMaintenance(async()=>true),{code:"SISTEMA_OCUPADO"});}finally{release2();release1();}
  await assert.rejects(resetMaintenance(async()=>{assert.throws(()=>enterApiRequest(),{code:"MANTENIMIENTO"});throw new Error("Fallo de prueba")}),/Fallo de prueba/);
  enterApiRequest()();
});
