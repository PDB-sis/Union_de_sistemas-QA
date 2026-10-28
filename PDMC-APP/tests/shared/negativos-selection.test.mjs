import test from "node:test";
import assert from "node:assert/strict";
import {updatePageSelection} from "../../shared/negativos/selection.ts";

test("seleccionar y deseleccionar una página conserva las demás",()=>{
  const first=[{id:"a",version:1},{id:"b",version:2}];
  const second=[{id:"c",version:3},{id:"d",version:4}];
  const selected=updatePageSelection(updatePageSelection({},first,true),second,true);
  assert.deepEqual(selected,{a:1,b:2,c:3,d:4});
  assert.deepEqual(updatePageSelection(selected,first,false),{c:3,d:4});
  assert.deepEqual(selected,{a:1,b:2,c:3,d:4});
});

test("el límite del lote se aplica entre páginas sin perder lo marcado",()=>{
  const first=Array.from({length:75},(_,i)=>({id:`a-${i}`,version:1}));
  const second=Array.from({length:50},(_,i)=>({id:`b-${i}`,version:2}));
  const selected=updatePageSelection(updatePageSelection({},first,true),second,true);
  assert.equal(Object.keys(selected).length,100);
  assert.equal(Object.keys(selected).filter(id=>id.startsWith("a-")).length,75);
  assert.equal(Object.keys(selected).filter(id=>id.startsWith("b-")).length,25);
});
