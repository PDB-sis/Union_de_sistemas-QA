import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import { loadEnv } from "../src/env.ts";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {POST} from "../src/http/sincronizacion/route.ts";

// Botón "Actualizar ahora" (inventario, transferencias, devoluciones…): el permiso viene del rol,
// no de tener alcance nacional. Antes un usuario de Mejora Continua asignado a una región veía
// el módulo pero recibía "No tiene permiso para esta operación o ubicación".
loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_sync_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
let originalDb,originalOrigin;

before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  for(const migration of (await readdir(new URL('../../backend/prisma/migrations',import.meta.url),{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
    const sql=await readFile(new URL(`../../backend/prisma/migrations/${migration.name}/migration.sql`,import.meta.url),'utf8');
    await admin.query(sql.replaceAll('"public"',`"${schema}"`));
  }
  originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;
  originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN='https://pdmc.example.test';
});

after(async()=>{
  if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;
  if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;
  await db.$disconnect();
  if(!/^pdmc_sync_[a-f0-9]{32}$/.test(schema))throw new Error('Esquema de prueba inválido.');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});

async function account(rol,ubicacionId){
  const user=await db.usuario.create({data:{email:`${randomUUID()}@sync.test`,nombre:`Usuario ${rol}`,rol,estado:'ACTIVO',debeCambiarPassword:false,asignaciones:{create:{rol,ubicacionId}}}});
  const token=randomBytes(32).toString('base64url');
  await db.sesionUsuario.create({data:{usuarioId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600_000)}});
  return `__Host-pdmc-session=${token}`;
}

async function actualizar(modulo,cookie){
  const response=await POST(new Request(`https://pdmc.example.test/api/sincronizacion?modulo=${modulo}`,{method:'POST',headers:{Origin:'https://pdmc.example.test',cookie}}));
  return {status:response.status,body:await response.json()};
}

test('Actualizar ahora: lo permite el rol aunque el usuario tenga solo una región',async()=>{
  const region=await db.ubicacion.create({data:{codigo:'R-SYNC',nombre:'Región de prueba',tipo:'REGION'}});
  const mejoraRegional=await account('MEJORA_CONTINUA',region.id);
  for(const modulo of ['INVENTARIO','TRANSFERENCIAS','DEVOLUCIONES']){
    const result=await actualizar(modulo,mejoraRegional);
    // La ejecución puede terminar sin cambios o fallar por la fuente de prueba, pero nunca por permisos.
    assert.notEqual(result.status,403,`${modulo}: ${JSON.stringify(result.body)}`);
    assert.notEqual(result.body.error?.code,'PERMISO',modulo);
  }
});

test('Actualizar ahora: sigue rechazando a los roles que no tienen el permiso',async()=>{
  const region=await db.ubicacion.create({data:{codigo:'R-SYNC-2',nombre:'Otra región',tipo:'REGION'}});
  const auditoria=await account('AUDITORIA',region.id);
  for(const modulo of ['INVENTARIO','TRANSFERENCIAS']){
    const result=await actualizar(modulo,auditoria);
    assert.equal(result.status,403,modulo);
    assert.equal(result.body.error.code,'PERMISO',modulo);
  }
});
