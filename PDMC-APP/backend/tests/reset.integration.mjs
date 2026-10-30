import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile,readdir,stat,unlink} from "node:fs/promises";
import {resolve} from "node:path";
import { loadEnv } from "../src/env.ts";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {ProjectReset} from "../src/admin/reset.ts";
import {createResetBackup} from "../src/admin/reset-backup.ts";
import {Authorization} from "../src/auth/authorization.ts";
import {hashPassword} from "../src/auth/password.ts";
import {GET,POST} from "../src/http/admin/[...path]/route.ts";
loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!["127.0.0.1","localhost","[::1]"].includes(new URL(connectionString).hostname)))throw new Error("Use PostgreSQL de pruebas local.");
const schema=`pdmc_test_${randomUUID().replaceAll("-","")}`,sql=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const password=randomBytes(24).toString("base64url"),hash=(s)=>createHash("sha256").update(s).digest("hex");
let encoded,originalDb,originalOrigin,originalUrl;const backupFiles=[];
before(async()=>{await sql.connect();await sql.query(`CREATE SCHEMA "${schema}"`);await sql.query(`SET search_path TO "${schema}"`);for(const d of (await readdir(new URL("../../backend/prisma/migrations",import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await sql.query((await readFile(new URL(`../../backend/prisma/migrations/${d.name}/migration.sql`,import.meta.url),"utf8")).replaceAll('"public"',`"${schema}"`));encoded=await hashPassword(password);originalUrl=process.env.DATABASE_URL;process.env.DATABASE_URL=connectionString;originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN="https://pdmc.example.test";});
after(async()=>{if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;if(originalUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalUrl;for(const file of backupFiles){await unlink(file).catch(()=>{});await unlink(file+".sha256").catch(()=>{});}await db.$disconnect();assert.match(schema,/^pdmc_test_[a-f0-9]{32}$/);await sql.query(`DROP SCHEMA "${schema}" CASCADE`);await sql.end();});
async function account(rol="ADMINISTRADOR"){
  const user=await db.usuario.create({data:{email:`${randomUUID()}@example.test`,nombre:"Administrador de prueba",passwordHash:encoded,estado:"ACTIVO",debeCambiarPassword:false,asignaciones:{create:{rol,ubicacionId:null}}}}),token=randomBytes(32).toString("base64url");
  await db.sesionUsuario.create({data:{usuarioId:user.id,tokenHash:hash(token),expiresAt:new Date(Date.now()+3600000)}});return {user,token,access:new Authorization(db,user.id)};
}
const payload=(c)=>({id:c.id,token:c.token,password,confirmacion:"RESTABLECER PDMC DESDE CERO",acepto:true});

test("las rutas de restablecimiento exigen sesión, origen y rol administrador",async()=>{
  const viewer=await account("AUDITORIA"),admin=await account();
  const call=(method,path,user,body,origin="https://pdmc.example.test")=>(method==="GET"?GET:POST)(new Request(`https://pdmc.example.test/api/admin/${path}`,{method,headers:{Origin:origin,...(user?{cookie:`__Host-pdmc-session=${user.token}`}:{}) ,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({path:path.split("/")})});
  assert.equal((await call("GET","restablecer")).status,401);
  for(const [method,path] of [["GET","restablecer"],["POST","restablecer/preparar"],["POST","restablecer/ejecutar"]])assert.equal((await call(method,path,viewer,method==="POST"?{}:undefined)).status,403);
  assert.equal((await call("POST","restablecer/preparar",admin,{password},"https://ajeno.test")).status,403);
  const service=new ProjectReset(db,admin.access,admin.token);
  await assert.rejects(service.prepare({password:"clave incorrecta"}),{status:403,code:"PASSWORD"});
  assert.equal(await db.restablecimientoProyecto.count(),0);
});

test("cambios posteriores a la revisión invalidan la confirmación sin borrar",async()=>{
  const a=await account(),service=new ProjectReset(db,a.access,a.token,async()=>{throw new Error("No debe respaldar")});
  const c=await service.prepare({password});await db.restablecimientoProyecto.update({where:{id:c.id},data:{disponibleDesde:new Date(0)}});
  await assert.rejects(new ProjectReset(db,a.access,"otra-sesion").execute(payload(c)),{code:"CONFIRMACION"});
  await db.restablecimientoProyecto.update({where:{id:c.id},data:{expiresAt:new Date(0)}});
  await assert.rejects(service.execute(payload(c)),{code:"CONFIRMACION"});
  await db.restablecimientoProyecto.update({where:{id:c.id},data:{expiresAt:new Date(Date.now()+60000)}});
  const b=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Cambio posterior"}});
  await assert.rejects(service.execute(payload(c)),{code:"DATOS_CAMBIARON"});assert.ok(await db.bodega.findUnique({where:{id:b.id}}));
});

test("respaldo obligatorio, espera, transacción y conservación de un solo administrador",async()=>{
  const a=await account(),other=await account("AUDITORIA"),b=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Bodega de prueba"}});
  const product=await db.producto.create({data:{codigoBarra:randomUUID()}});
  const primary=await db.negativo.create({data:{productoId:product.id,bodegaId:b.id,primeraDeteccion:new Date(),ultimaDeteccion:new Date()}});
  const merged=await db.producto.create({data:{codigoBarra:randomUUID()}});await db.negativo.create({data:{productoId:merged.id,bodegaId:b.id,fusionadoEnId:primary.id,primeraDeteccion:new Date(),ultimaDeteccion:new Date()}});
  const fail=new ProjectReset(db,a.access,a.token,async()=>{throw new Error("Respaldo fallido de prueba")});
  const c=await fail.prepare({password});
  await assert.rejects(fail.execute({...payload(c),confirmacion:"BORRAR"}));
  await assert.rejects(fail.execute(payload(c)),{code:"ESPERA"});
  await db.restablecimientoProyecto.update({where:{id:c.id},data:{disponibleDesde:new Date(0)}});
  await assert.rejects(fail.execute(payload(c)),/Respaldo fallido/);
  assert.ok(await db.negativo.findUnique({where:{id:primary.id}}));assert.ok(await db.usuario.findUnique({where:{id:other.user.id}}));
  const realBackup=async target=>{assert.equal(target,schema);const result=await createResetBackup(target);backupFiles.push(resolve("backups/restablecimientos",result.nombre));return result};
  const service=new ProjectReset(db,a.access,a.token,realBackup);
  await sql.query("CREATE FUNCTION reset_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='RESTABLECER_PROYECTO' THEN RAISE EXCEPTION 'prueba rollback'; END IF; RETURN NEW; END $$");
  await sql.query('CREATE TRIGGER reset_audit_failure BEFORE INSERT ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION reset_audit_failure()');
  try {await assert.rejects(service.execute(payload(c)));assert.ok(await db.negativo.findUnique({where:{id:primary.id}}));assert.ok(await db.usuario.findUnique({where:{id:other.user.id}}));assert.equal((await db.restablecimientoProyecto.findUniqueOrThrow({where:{id:c.id}})).consumidoAt,null);}
  finally {await sql.query('DROP TRIGGER reset_audit_failure ON "Auditoria"');}
  const result=await service.execute(payload(c)),backupFile=backupFiles.at(-1);
  assert.equal(result.restablecido,true);assert.ok((await stat(backupFile)).size>100);assert.equal((await readFile(backupFile)).subarray(0,5).toString(),"PGDMP");
  assert.equal(await db.usuario.count(),1);const kept=await db.usuario.findUniqueOrThrow({where:{id:a.user.id}});assert.equal(kept.passwordHash,encoded);assert.equal(kept.rol,"ADMINISTRADOR");
  assert.equal(await db.asignacionAcceso.count(),1);assert.equal(await db.sesionUsuario.count(),0);assert.equal(await db.producto.count(),0);assert.equal(await db.bodega.count(),0);assert.equal(await db.negativo.count(),0);assert.equal(await db.auditoria.count({where:{accion:"RESTABLECER_PROYECTO"}}),1);
  await assert.rejects(service.execute(payload(c)),{code:"CONFIRMACION"});
});
