import test from "node:test";
import assert from "node:assert/strict";
import {photoComparison} from "../src/negativos/photo-comparison.ts";

test("compara negativos publicados sin invertir el aumento del faltante",()=>{
  assert.equal(photoComparison(null,"-3",true,true).estado,"Nuevo");
  assert.deepEqual(photoComparison("-2","-5",true,true),{estado:"Empeoró",anterior:"-2",actual:"-5",variacionUnidades:"3.0000"});
  assert.equal(photoComparison("-5","-2",true,true).estado,"Mejoró");
  assert.equal(photoComparison("-2","-2.0000",true,true).estado,"Sin cambio");
  assert.equal(photoComparison("-2",null,true,true).estado,"Desapareció");
  assert.equal(photoComparison("-2.0001","-2.0002",true,true).variacionUnidades,"0.0001");
});
test("no inventa comparaciones cuando falta una fotografía",()=>{
  assert.equal(photoComparison(null,"-3",false,true).estado,"Primera fotografía");
  assert.equal(photoComparison(null,"-3",false,true).variacionUnidades,null);
  assert.equal(photoComparison(null,"-3",true,false).estado,"Sin fotografía");
  assert.equal(photoComparison(null,null,true,true).estado,"Fuera de fotografía");
});
