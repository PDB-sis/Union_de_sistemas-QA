import test from "node:test";
import assert from "node:assert/strict";
import {normalizeStoreCode} from "../backend/src/transferencias/consulta.ts";

test("las transferencias enlazan tiendas por código corporativo y no por nombre",()=>{
  assert.equal(normalizeStoreCode("  zul-014  "),"ZUL-014");
  assert.equal(normalizeStoreCode('="zul-014"'),"ZUL-014");
  assert.notEqual(normalizeStoreCode("C.C. Ciudad Chinita"),"ZUL-014");
});
