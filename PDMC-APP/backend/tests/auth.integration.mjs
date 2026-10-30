import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import { loadEnv } from "../src/env.ts";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {AuthService,userByEmail} from "../src/auth/service.ts";
import {hashPassword,verifyPassword} from "../src/auth/password.ts";
import {initialUsers,provisionUsers,administerUser} from "../src/auth/provisioning.ts";
import {roles} from "@pdmc/contratos/auth/model";
import {POST as authPost,GET as authGet} from "../src/http/auth/[action]/route.ts";
import {GET as operationGet} from "../src/http/operacion/negativos/[...path]/route.ts";

loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!["localhost","127.0.0.1","[::1]"].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_test_${randomUUID().replaceAll("-","")}`;
const admin=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const auth=new AuthService(db);
const secret=()=>randomBytes(24).toString("base64url");
let originalDb,originalOrigin;
before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  for(const d of (await readdir(new URL("../../backend/prisma/migrations",import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
    await admin.query((await readFile(new URL(`../../backend/prisma/migrations/${d.name}/migration.sql`,import.meta.url),"utf8")).replaceAll('"public"',`"${schema}"`));
  }
  originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;
  originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN="https://pdmc.example.test";
});
after(async()=>{
  if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;
  if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;
  await db.$disconnect();
  if(!/^pdmc_test_[a-f0-9]{32}$/.test(schema))throw new Error("Esquema inválido");
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});
async function account(data={}) {
  const password=secret();const email=`${randomUUID()}@example.test`;
  const user=await db.usuario.create({data:{email,nombre:"Prueba",estado:"ACTIVO",debeCambiarPassword:false,passwordHash:await hashPassword(password),...data}});
  if(data.rol==="ADMINISTRADOR") await db.asignacionAcceso.create({data:{usuarioId:user.id,rol:"ADMINISTRADOR"}});
  return {user,password,email};
}
function req(action,body,cookie) {
  return new Request(`https://pdmc.example.test/api/auth/${action}`,{method:body===undefined?"GET":"POST",headers:{Origin:"https://pdmc.example.test","Content-Type":"application/json",...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const context=action=>({params:Promise.resolve({action})});
test("seed por el catálogo vigente de roles es idempotente y nunca restaura claves temporales",async()=>{
  const env={};
  for(const rol of Object.keys(roles)){env[`PDMC_SEED_${rol}_EMAIL`]=`${rol.toLowerCase()}@seed.test`;env[`PDMC_SEED_${rol}_PASSWORD`]=secret();}
  assert.equal(initialUsers(env).length,Object.keys(roles).length);
  assert.deepEqual(await provisionUsers(db,env),{creados:Object.keys(roles).length,existentes:0});
  const email=env.PDMC_SEED_ADMINISTRADOR_EMAIL;
  const old=env.PDMC_SEED_ADMINISTRADOR_PASSWORD;
  const login=await auth.login({email,password:old});
  assert.equal(login.debeCambiarPassword,true);
  const next=secret();await auth.changePassword(login.token,{actual:old,nueva:next});
  assert.deepEqual(await provisionUsers(db,env),{creados:0,existentes:Object.keys(roles).length});
  await assert.rejects(auth.login({email,password:old}),{status:401});
  const current=await auth.login({email,password:next});assert.equal(current.debeCambiarPassword,false);
  assert.equal(await auth.session(login.token),null);
  const saved=await db.usuario.findUniqueOrThrow({where:{email}});
  assert.notEqual(saved.passwordHash,next);assert.equal(await verifyPassword(next,saved.passwordHash),true);
});
test("anónimo y token técnico no acceden; cookie segura, cambio obligatorio, logout y auditoría",async()=>{
  const a=await account({estado:"INVITADO",debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+3600000)});
  const path={params:Promise.resolve({path:["lista"]})};
  assert.equal((await operationGet(new Request("https://pdmc.example.test/api/operacion/negativos/lista"),path)).status,401);
  const response=await authPost(req("login",{email:a.email,password:a.password}),context("login"));assert.equal(response.status,200);
  const setCookie=response.headers.get("set-cookie");assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);assert.match(setCookie,/Max-Age=900/);
  const cookie=setCookie.split(";",1)[0];
  assert.equal((await operationGet(new Request("https://pdmc.example.test/api/operacion/negativos/lista",{headers:{cookie}}),path)).status,403);
  const session=await authGet(req("sesion",undefined,cookie),context("sesion"));assert.equal((await session.json()).data.debeCambiarPassword,true);
  const changed=await authPost(req("password",{actual:a.password,nueva:secret()},cookie),context("password"));assert.equal(changed.status,200);
  assert.match(changed.headers.get("set-cookie"),/Max-Age=0/);
  assert.equal((await authGet(req("sesion",undefined,cookie),context("sesion"))).status,401);
  const b=await account();const login=await auth.login({email:b.email,password:b.password});
  await assert.rejects(auth.login({email:b.email,password:secret()}),{status:401});
  await auth.logout(login.token);assert.equal(await auth.session(login.token),null);
  const audits=await db.auditoria.findMany({where:{entidad:"Autenticacion"}});
  for(const action of ["LOGIN_EXITOSO","LOGIN_FALLIDO","LOGOUT","PASSWORD_CAMBIADO"])assert.ok(audits.some(a=>a.accion===action));
  const serialized=JSON.stringify(audits);for(const sensitive of [a.password,b.password,login.token,b.user.passwordHash])assert.equal(serialized.includes(sensitive),false);
});
test("bloqueados, inactivos, invitados vencidos, revocación y errores genéricos",async()=>{
  const a=await account();const login=await auth.login({email:a.email,password:a.password});
  assert.equal(await userByEmail(db,"%@example.test"),null);
  await db.usuario.update({where:{id:a.user.id},data:{estado:"BLOQUEADO"}});
  assert.equal(await auth.session(login.token),null);
  await assert.rejects(auth.login({email:a.email,password:a.password}),{status:401});
  await db.usuario.update({where:{id:a.user.id},data:{estado:"INACTIVO"}});
  await assert.rejects(auth.login({email:a.email,password:a.password}),{status:401});
  await db.usuario.update({where:{id:a.user.id},data:{estado:"INVITADO",debeCambiarPassword:true,passwordTemporalHasta:new Date(0)}});
  await assert.rejects(auth.login({email:a.email,password:a.password}),{status:401});
  await assert.rejects(auth.login({email:`${randomUUID()}@unknown.test`,password:secret()}),{status:401});
  const forged=await authPost(new Request("https://pdmc.example.test/api/auth/login",{method:"POST",headers:{origin:"https://attacker.test","content-type":"application/json"},body:"{}"}),context("login"));assert.equal(forged.status,403);
});
test("restablecimiento administrativo revoca sesiones, exige cambio y limita intentos",async()=>{
  const a=await account({rol:"ADMINISTRADOR"});const target=await account();
  const session=await auth.login({email:target.email,password:target.password});
  const temporary=secret();
  await administerUser(db,{PDMC_ADMIN_ACTOR_EMAIL:a.email,PDMC_ADMIN_USUARIO_EMAIL:target.email,PDMC_ADMIN_MOTIVO:"Restablecimiento de prueba",PDMC_ADMIN_PASSWORD_TEMPORAL:temporary});
  assert.equal(await auth.session(session.token),null);
  await assert.rejects(auth.login({email:target.email,password:target.password}),{status:401});
  const pending=await auth.login({email:target.email,password:temporary});assert.equal(pending.debeCambiarPassword,true);
  await auth.changePassword(pending.token,{actual:temporary,nueva:secret()});
  await assert.rejects(auth.login({email:target.email,password:temporary}),{status:401});
  const identifier=randomUUID();for(let i=0;i<3;i++)await auth.throttle(identifier,3);
  await assert.rejects(auth.throttle(identifier,3),{status:429});
});
test("fallo de auditoría revierte login y cambio de contraseña",async()=>{
  const a=await account();const login=await auth.login({email:a.email,password:a.password});
  await admin.query(`CREATE FUNCTION reject_auth_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END; $$`);
  await admin.query(`CREATE TRIGGER fail_auth_audit BEFORE INSERT ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION reject_auth_audit()`);
  try {
    const count=await db.sesionUsuario.count();
    await assert.rejects(auth.login({email:a.email,password:a.password}));assert.equal(await db.sesionUsuario.count(),count);
    await assert.rejects(auth.changePassword(login.token,{actual:a.password,nueva:secret()}));
    assert.equal((await db.usuario.findUniqueOrThrow({where:{id:a.user.id}})).passwordHash,a.user.passwordHash);
    assert.ok(await auth.session(login.token));
  } finally {await admin.query(`DROP TRIGGER fail_auth_audit ON "Auditoria"`);}
});
