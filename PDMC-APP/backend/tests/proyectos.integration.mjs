import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import { loadEnv } from "../src/env.ts";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {Authorization} from "../src/auth/authorization.ts";
import {ProjectService} from "../src/proyectos/service.ts";
import {GET,POST} from "../src/http/proyectos/[...path]/route.ts";

// Proyectos compartidos: cada proyecto lo ven su propietario y sus miembros; los lectores solo
// ven y comentan; dos personas que guardan a la vez no se pisan.
loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!["127.0.0.1","localhost","[::1]"].includes(new URL(connectionString).hostname)))throw new Error("Use PostgreSQL local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_test_${randomUUID().replaceAll("-","")}`;
const sql=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const origin="https://pdmc.example.test";
let originalDb,originalOrigin,zona;
before(async()=>{
  await sql.connect();await sql.query(`CREATE SCHEMA "${schema}"`);await sql.query(`SET search_path TO "${schema}"`);
  for(const d of (await readdir(new URL("../../backend/prisma/migrations",import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await sql.query((await readFile(new URL(`../../backend/prisma/migrations/${d.name}/migration.sql`,import.meta.url),"utf8")).replaceAll('"public"',`"${schema}"`));
  originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN=origin;
  zona=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Región de proyectos",tipo:"REGION"}});
});
after(async()=>{
  if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;
  if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;
  await db.$disconnect();if(!/^pdmc_test_[a-f0-9]{32}$/.test(schema))throw new Error("Esquema inválido");await sql.query(`DROP SCHEMA "${schema}" CASCADE`);await sql.end();
});
async function persona(nombre,rol="MEJORA_CONTINUA"){
  const u=await db.usuario.create({data:{email:`${randomUUID()}@example.test`,nombre,rol,estado:"ACTIVO",debeCambiarPassword:false,asignaciones:{create:{rol,ubicacionId:zona.id}}}});
  const token=randomBytes(32).toString("base64url");await db.sesionUsuario.create({data:{usuarioId:u.id,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt:new Date(Date.now()+3600000)}});
  return {...u,cookie:`__Host-pdmc-session=${token}`,proyectos:new ProjectService(db,new Authorization(db,u.id))};
}
const pedir=(u,path,body,method=body===undefined?"GET":"POST")=>({GET,POST})[method](new Request(`${origin}/api/proyectos/${path}`,{method,headers:{cookie:u.cookie,origin,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined}),{params:Promise.resolve({path:path.split("/").filter(Boolean)})});

test("solo el propietario y los miembros ven el proyecto; los lectores no editan",async()=>{
  const ana=await persona("Ana Mejora"),luis=await persona("Luis Jefe","JEFE_BODEGA"),rosa=await persona("Rosa Tienda","TIENDA"),otro=await persona("Otro Usuario");
  const {id}=await ana.proyectos.create({titulo:"Reducir negativos de Sambil"});
  assert.deepEqual((await ana.proyectos.list()).map(p=>[p.titulo,p.acceso]),[["Reducir negativos de Sambil","PROPIETARIO"]]);
  assert.deepEqual(await luis.proyectos.list(),[]);
  await assert.rejects(otro.proyectos.get(id),{status:404});
  await ana.proyectos.addMember(id,{usuarioId:luis.id,permiso:"EDITOR"});
  await ana.proyectos.addMember(id,{usuarioId:rosa.id,permiso:"LECTOR"});
  assert.deepEqual((await luis.proyectos.list()).map(p=>p.acceso),["EDITOR"]);
  // El editor cambia la página; el lector solo comenta.
  const detalle=await luis.proyectos.get(id);
  const {version}=await luis.proyectos.update(id,{version:detalle.version,contenido:[{id:"a",tipo:"titulo",texto:"Plan"},{id:"b",tipo:"casilla",texto:"Contar Sambil",hecho:false}]});
  await assert.rejects(rosa.proyectos.update(id,{version,titulo:"Cambio no permitido"}),{status:403});
  await rosa.proyectos.comment(id,{texto:"Mañana cuento la caja 4."});
  const visto=await rosa.proyectos.get(id);
  assert.equal(visto.acceso,"LECTOR");assert.equal(visto.contenido[1].texto,"Contar Sambil");assert.equal(visto.comentarios[0].autor.nombre,"Rosa Tienda");
  // Quien no es miembro sigue sin verlo, también por la API.
  assert.equal((await (await pedir(otro,id)).json()).error.code,"PROYECTO");
  assert.equal((await (await pedir(ana,"")).json()).data.length,1);
});

test("dos personas que guardan a la vez no se pisan; las tareas solo para miembros",async()=>{
  const ana=await persona("Ana Dos"),luis=await persona("Luis Dos"),ajeno=await persona("Ajeno");
  const {id}=await ana.proyectos.create({titulo:"Etiquetado de temporada"});
  await ana.proyectos.addMember(id,{usuarioId:luis.id});
  const v1=(await ana.proyectos.get(id)).version;
  await ana.proyectos.update(id,{version:v1,estado:"EN_CURSO"});
  await assert.rejects(luis.proyectos.update(id,{version:v1,estado:"EN_PAUSA"}),{status:409,code:"CONFLICTO"});
  await assert.rejects(ana.proyectos.addTask(id,{titulo:"Revisar",responsableId:ajeno.id}),{status:422,code:"RESPONSABLE"});
  const tarea=await ana.proyectos.addTask(id,{titulo:"Revisar etiquetas",responsableId:luis.id,fechaLimite:"2026-11-20"});
  await luis.proyectos.updateTask(id,tarea.id,{estado:"HECHA"});
  const resumen=(await luis.proyectos.list()).find(p=>p.id===id);
  assert.deepEqual(resumen.tareas,{total:1,hechas:1});
  // La actividad queda en la auditoría del proyecto, en orden.
  const acciones=(await ana.proyectos.get(id)).actividad.map(a=>a.accion);
  for(const accion of ["CREAR_PROYECTO","COMPARTIR_PROYECTO","EDITAR_PROYECTO","CREAR_TAREA_PROYECTO","ACTUALIZAR_TAREA_PROYECTO"])assert.ok(acciones.includes(accion),accion);
  // Un miembro puede salir; el propietario no se puede quitar.
  await assert.rejects(luis.proyectos.removeMember(id,ana.id),{status:422});
  await luis.proyectos.removeMember(id,luis.id);
  await assert.rejects(luis.proyectos.get(id),{status:404});
});

test("el directorio para compartir no muestra la cuenta de sincronización ni a uno mismo",async()=>{
  const ana=await persona("Ana Directorio");
  await db.usuario.create({data:{email:`sincronizacion.${randomUUID()}@pdmc.local`,nombre:"Sincronización",rol:"SINCRONIZACION",estado:"ACTIVO",debeCambiarPassword:false}});
  const nombres=(await ana.proyectos.people({})).map(p=>p.nombre);
  assert.ok(!nombres.includes("Sincronización"));assert.ok(!nombres.includes("Ana Directorio"));assert.ok(nombres.includes("Ajeno"));
  const {importados}=await ana.proyectos.importLocal({proyectos:[{name:"Proyecto del navegador",next:"Llamar a la tienda",status:"En curso",progress:40}]});
  assert.equal(importados,1);
  assert.equal((await ana.proyectos.list()).find(p=>p.titulo==="Proyecto del navegador").estado,"EN_CURSO");
});

test("plantillas, mis tareas de todos mis proyectos y duplicar sin miembros",async()=>{
  const ana=await persona("Ana Plantillas"),luis=await persona("Luis Tareas");
  const {id}=await ana.proyectos.create({plantilla:"mejora"});
  const plan=await ana.proyectos.get(id);
  assert.equal(plan.titulo,"Plan de mejora");assert.equal(plan.color,"verde");
  assert.ok(plan.contenido.some(b=>b.tipo==="titulo"&&b.texto==="Objetivo"));
  assert.equal(plan.tareas.length,4);
  await ana.proyectos.addMember(id,{usuarioId:luis.id});
  await ana.proyectos.updateTask(id,plan.tareas[1].id,{responsableId:luis.id,fechaLimite:"2026-11-14"});
  await ana.proyectos.updateTask(id,plan.tareas[0].id,{responsableId:luis.id,fechaLimite:"2026-11-12"});
  await ana.proyectos.updateTask(id,plan.tareas[2].id,{responsableId:luis.id,estado:"HECHA"});
  // Mis tareas: solo las pendientes asignadas a mí, de la más próxima a la más lejana.
  assert.deepEqual((await luis.proyectos.myTasks()).map(t=>[t.titulo,t.fechaLimite,t.proyecto.titulo]),[["Medir la situación actual","2026-11-12","Plan de mejora"],["Identificar las causas principales","2026-11-14","Plan de mejora"]]);
  assert.deepEqual(await ana.proyectos.myTasks(),[]);
  // Si deja de tener acceso, sus tareas de ese proyecto ya no aparecen.
  await luis.proyectos.removeMember(id,luis.id);
  assert.deepEqual(await luis.proyectos.myTasks(),[]);
  // Duplicar: una copia propia con la página y las tareas, sin miembros.
  await ana.proyectos.addMember(id,{usuarioId:luis.id,permiso:"LECTOR"});
  const copia=await luis.proyectos.get((await luis.proyectos.duplicate(id)).id);
  assert.equal(copia.titulo,"Plan de mejora (copia)");assert.equal(copia.acceso,"PROPIETARIO");assert.equal(copia.miembros.length,0);assert.equal(copia.tareas.length,4);
  assert.ok(copia.tareas.every(t=>t.estado==="PENDIENTE"&&t.responsableId===null));
});
