import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {canDelegate,createUserSchema,editUserSchema,grantSchema} from "../backend/src/admin/service.ts";
const grant=(rol,ubicacionId=null,tipo=null,regionId=null)=>({rol,ubicacionId,ubicacion:ubicacionId?{tipo,regionId}:null});
test("delegación requiere todos los permisos y el territorio; no combina roles con otros alcances",()=>{
  const region=randomUUID(),store=randomUUID(),other=randomUUID();
  const actor=[grant("MEJORA_CONTINUA",region,"REGION"),grant("AUDITORIA",null)];
  assert.equal(canDelegate(actor,[grant("TIENDA",store,"TIENDA",region)]),false);
  assert.equal(canDelegate(actor,[grant("TIENDA",other,"TIENDA",randomUUID())]),false);
  assert.equal(canDelegate(actor,[grant("TIENDA")]),false);
  assert.equal(canDelegate(actor,[grant("ADMINISTRADOR",store,"TIENDA",region)]),false);
  assert.equal(canDelegate([grant("ADMINISTRADOR")],[grant("ADMINISTRADOR"),grant("FACTURACION",store,"TIENDA",region)]),true);
});
test("alta y edición estrictas: identidad normalizada, sin permisos arbitrarios ni hashes entrantes",()=>{
  const body={nombre:"Prueba",email:" Usuario.Prueba ",passwordTemporal:randomBytes(24).toString("base64url"),asignaciones:[],motivo:"Alta de prueba"};
  assert.equal(createUserSchema.parse(body).email,"usuario.prueba");
  assert.equal(createUserSchema.safeParse({...body,passwordHash:"no admitido"}).success,false);
  assert.equal(createUserSchema.safeParse({...body,passwordTemporal:"corta"}).success,false);
  assert.equal(grantSchema.safeParse([{rol:"ADMINISTRADOR",ubicacionId:null},{rol:"ADMINISTRADOR",ubicacionId:null}]).success,false);
  assert.equal(grantSchema.safeParse([{rol:"INVENTADO",ubicacionId:null}]).success,false);
  assert.equal(editUserSchema.safeParse({id:randomUUID(),nombre:"Nombre",email:"a@b.test",version:new Date().toISOString(),asignaciones:[],motivo:"Edición válida",activo:true}).success,false);
});
