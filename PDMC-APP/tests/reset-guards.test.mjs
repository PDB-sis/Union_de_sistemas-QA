import test from "node:test";
import assert from "node:assert/strict";
import {enterApiRequest,resetMaintenance} from "../backend/src/maintenance.ts";
import {syncProjectStorage} from "../frontend/lib/project-storage.ts";
test("el mantenimiento espera operaciones en curso y bloquea nuevas solicitudes",async()=>{
  const release1=enterApiRequest(),release2=enterApiRequest();
  try{await assert.rejects(resetMaintenance(async()=>true),{code:"SISTEMA_OCUPADO"});}finally{release2();release1();}
  await assert.rejects(resetMaintenance(async()=>{assert.throws(()=>enterApiRequest(),{code:"MANTENIMIENTO"});throw new Error("Fallo de prueba")}),/Fallo de prueba/);
  enterApiRequest()();
});
test("un nuevo restablecimiento limpia borradores al ingresar desde otro navegador",()=>{
  class Storage {getItem(key){return typeof this[key]==="string"?this[key]:null}setItem(key,value){this[key]=value}removeItem(key){delete this[key]}}
  const original=globalThis.window,localStorage=new Storage(),sessionStorage=new Storage();
  globalThis.window={localStorage,sessionStorage};
  try{
    localStorage.setItem("mc-proyectos","prueba");localStorage.setItem("theme","dark");sessionStorage.setItem("pdmc:borrador","prueba");
    syncProjectStorage(null);assert.equal(localStorage.getItem("mc-proyectos"),"prueba");
    syncProjectStorage("reset-1");assert.equal(localStorage.getItem("mc-proyectos"),null);assert.equal(sessionStorage.getItem("pdmc:borrador"),null);assert.equal(localStorage.getItem("theme"),"dark");
    localStorage.setItem("mc-proyectos","oficial");syncProjectStorage("reset-1");assert.equal(localStorage.getItem("mc-proyectos"),"oficial");
    syncProjectStorage("reset-2");assert.equal(localStorage.getItem("mc-proyectos"),null);
  }finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}
});
