import test from "node:test";
import assert from "node:assert/strict";
import {classifyTransfer,transferType,transferTypeLabel} from "../src/transferencias/classification.ts";

test("clasifica transferencias por su descripción",()=>{
  assert.equal(transferType("TRANSFERENCIA DE CORRECCIÓN"),"CORRECCION");
  assert.equal(transferType("Rotacion de mercancía entre tiendas"),"ROTACION");
  assert.equal(transferType("Despacho regular"),"NORMAL");
  assert.equal(transferType(null),"NORMAL");
  assert.equal(transferTypeLabel.CORRECCION,"Corrección");
  assert.equal(transferTypeLabel.ROTACION,"Rotación de mercancía");
});

test("acepta errores de escritura",()=>{
  for(const texto of ["correcion","coreccion","corecion","correcsion","corrrección","correccio de transf 1234","CORECCON","corregida la transf 55","se corrige","correc. transf 9","CORRECCION/TIENDA 05","transf.correccion","correccion123"])
    assert.equal(transferType(texto),"CORRECCION",texto);
  for(const texto of ["rotasion","rotacíon","rotaccion","rotacon","ROTAZION","rotaciones tienda 3","rotar mercancía","mercancía rotada","rotacio"])
    assert.equal(transferType(texto),"ROTACION",texto);
});

test("no confunde palabras parecidas ni negaciones",()=>{
  for(const texto of ["nueva colección","dotación de uniformes","rotulación de cajas","cajas rotas","caja rota","corresponde a la tienda 4","enviar por correo","corte de inventario","no es corrección","sin rotación","no es una rotación","notación"])
    assert.equal(transferType(texto),"NORMAL",texto);
});

test("quien la registró es la segunda señal: si no coincide, se marca para revisar",()=>{
  assert.deepEqual(classifyTransfer("Corrección transf 120","NOREIMA"),{type:"CORRECCION",review:null});
  assert.deepEqual(classifyTransfer("rotasion","auxiliar4"),{type:"ROTACION",review:null});
  assert.deepEqual(classifyTransfer("Despacho regular","MARIA"),{type:"NORMAL",review:null});
  const dudosa=classifyTransfer("Despacho regular","NOREIMA");
  assert.equal(dudosa.type,"NORMAL");
  assert.match(dudosa.review??"",/NOREIMA/);
  assert.equal(classifyTransfer("corrección por rotación","MARIA").review,"La observación menciona corrección y rotación.");
  assert.match(classifyTransfer("Despacho","OTRO",["OTRO"]).review??"",/OTRO/);
});
