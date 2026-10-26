import test from "node:test";
import assert from "node:assert/strict";
import {transferType,transferTypeLabel} from "../shared/transferencias/classification.ts";

test("clasifica transferencias por su descripción",()=>{
  assert.equal(transferType("TRANSFERENCIA DE CORRECCIÓN"),"CORRECCION");
  assert.equal(transferType("Rotacion de mercancía entre tiendas"),"ROTACION");
  assert.equal(transferType("Despacho regular"),"NORMAL");
  assert.equal(transferType(null),"NORMAL");
  assert.equal(transferTypeLabel.CORRECCION,"Corrección");
  assert.equal(transferTypeLabel.ROTACION,"Rotación de mercancía");
});
