import test from "node:test";
import assert from "node:assert/strict";
import {syncProjectStorage} from "../src/lib/project-storage.ts";
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
