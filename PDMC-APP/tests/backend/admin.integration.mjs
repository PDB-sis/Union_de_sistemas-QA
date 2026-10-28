import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../generated/prisma/client.ts";
import {Administration,ensureActiveAdministrator} from "../../backend/src/admin/service.ts";
import {Authorization} from "../../backend/src/auth/authorization.ts";
import {AuthService} from "../../backend/src/auth/service.ts";
import {hashPassword,verifyPassword} from "../../backend/src/auth/password.ts";
import {GET,POST,PATCH} from "../../app/api/admin/[...path]/route.ts";
import {POST as negativePost,PATCH as negativePatch} from "../../app/api/operacion/negativos/[...path]/route.ts";
import {TransferQueryService} from "../../backend/src/transferencias/consulta.ts";
import {BillingObservationService} from "../../backend/src/facturacion/observaciones.ts";
import {ReturnsService} from "../../backend/src/devoluciones/service.ts";
import {InconsistencyService} from "../../backend/src/inconsistencias/service.ts";
import {NegativeOperations} from "../../backend/src/negativos/operations.ts";
nextEnv.loadEnvConfig(process.cwd());
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!["127.0.0.1","localhost","[::1]"].includes(new URL(connectionString).hostname)))throw new Error("Use PostgreSQL local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_test_${randomUUID().replaceAll("-","")}`;
const sql=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const secret=()=>randomBytes(24).toString("base64url");
const motivo="Operación administrativa de prueba";
const origin="https://pdmc.example.test";
let originalDb,originalOrigin,hashed;
before(async()=>{
  await sql.connect();await sql.query(`CREATE SCHEMA "${schema}"`);await sql.query(`SET search_path TO "${schema}"`);
  for(const d of (await readdir(new URL("../../backend/prisma/migrations",import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await sql.query((await readFile(new URL(`../../backend/prisma/migrations/${d.name}/migration.sql`,import.meta.url),"utf8")).replaceAll('"public"',`"${schema}"`));
  originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN=origin;hashed=await hashPassword(secret());
});
after(async()=>{
  if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;
  if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;
  await db.$disconnect();if(!/^pdmc_test_[a-f0-9]{32}$/.test(schema))throw new Error("Esquema inválido");await sql.query(`DROP SCHEMA "${schema}" CASCADE`);await sql.end();
});
async function user(grants=[{rol:"ADMINISTRADOR",ubicacionId:null}],extra={}) {
  const u=await db.usuario.create({data:{email:`${randomUUID()}@example.test`,nombre:"Usuario de prueba",estado:"ACTIVO",debeCambiarPassword:false,passwordHash:hashed,asignaciones:{create:grants},...extra}});
  const token=randomBytes(32).toString("base64url");await db.sesionUsuario.create({data:{usuarioId:u.id,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt:new Date(Date.now()+3600000)}});
  return {...u,token,cookie:`__Host-pdmc-session=${token}`,service:new Administration(db,u.id),access:new Authorization(db,u.id)};
}
function request(path,u,body,method="GET",site=origin) {return new Request(`${origin}${path}`,{method,headers:{Origin:site,"Content-Type":"application/json",...(u?{cookie:u.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function api(path,u,body,method=body===undefined?"GET":"POST") {return ({GET,POST,PATCH}[method])(request(`/api/admin/${path}`,u,body,method),{params:Promise.resolve({path:path.split("?")[0].split("/")})});}
const edit=(u,asignaciones)=>({id:u.id,nombre:u.nombre,email:u.email,version:u.updatedAt.toISOString(),asignaciones,motivo});

test("corregir y verificar son colas distintas; los contadores permanecen estables",async()=>{
  const a=await user(),service=new InconsistencyService(db,a.access),transferencia=randomUUID();
  const row=await db.inconsistencia.create({data:{sourceKey:randomUUID(),fecha:new Date(),sucursal:"Prueba de flujo",transferencia,codigoBarra:randomUUID(),tipoError:"Faltante físico",cantidadErrada:2,conteoFisico:3,existenciaSistemaConteo:5,formaCorreccion:"Ajuste de inventario"}});
  const filters={q:transferencia,estado:"pendientes",flujo:"trabajo"};
  const initial=await service.list({...filters,cola:"corregir"});assert.equal(initial.total,1);
  await service.updateMany({cases:[{id:row.id,version:row.version,systemQuantity:5}],action:"ajustar",numeroAjuste:"AJ-PRUEBA"});
  const corrected=await service.list({...filters,cola:"corregir"}),verify=await service.list({...filters,cola:"verificar"});
  assert.equal(corrected.total,0);assert.equal(verify.total,1);assert.equal(verify.rows[0].resuelto,false);assert.deepEqual(corrected.summary,verify.summary);
  // No se cierra con responsable sin determinar; el rechazo no modifica el caso.
  await assert.rejects(service.updateMany({cases:[{id:row.id,version:verify.rows[0].version}],action:"resolver",formaCorreccion:"Ajuste de inventario"}),{status:422,code:"CIERRE_INCOMPLETO"});
  await service.updateMany({cases:[{id:row.id,version:verify.rows[0].version}],action:"resolver",formaCorreccion:"Ajuste de inventario",responsable:"BODEGA"});
  const closed=await db.inconsistencia.findUniqueOrThrow({where:{id:row.id}});
  assert.equal(closed.resuelto,true);assert.equal(closed.unidadesSinResolver,0);
});
test("toda corrección pasa por verificación y las unidades pendientes las calcula el servidor",async()=>{
  const a=await user(),service=new InconsistencyService(db,a.access);
  const row=await db.inconsistencia.create({data:{sourceKey:randomUUID(),fecha:new Date(),sucursal:"Prueba de corrección",transferencia:randomUUID(),codigoBarra:randomUUID(),tipoError:"Faltante físico",cantidadErrada:2,conteoFisico:3,existenciaSistemaConteo:5,unidadesSinResolver:2}});
  const base={id:row.id,conteoFisico:3,motivo:"Mercancía no incluida en la transferencia",responsable:"FACTURACION",comentarioAdmin:null,formaCorreccion:"Corrección de transferencia",numeroCorreccion:"81880",unidadesAjustadas:0,unidadesSinResolver:0,resuelto:false,ajustar:null,cantidadAjuste:null,numeroAjuste:null,veredicto:null,ajustado:false};
  await assert.rejects(service.update({...base,version:row.version,resuelto:true,unidadesAjustadas:2}),{status:422});
  let r=await service.update({...base,version:row.version,correccionEjecutada:true,unidadesAjustadas:1});
  assert.ok(r.correccionEjecutadaAt);assert.equal(r.correccionEjecutadaPorId,a.id);assert.equal(r.unidadesSinResolver,1,"la pantalla no puede dejar las unidades en 0");
  const verify=await service.list({q:row.transferencia,estado:"pendientes",flujo:"trabajo",cola:"verificar"});assert.equal(verify.total,1);
  await assert.rejects(service.update({...base,version:r.version,correccionEjecutada:true,unidadesAjustadas:1,resuelto:true}),{status:422,code:"CIERRE_INCOMPLETO"});
  r=await service.update({...base,version:r.version,correccionEjecutada:true,unidadesAjustadas:2,resuelto:true});
  assert.equal(r.resuelto,true);assert.equal(r.unidadesSinResolver,0);
});
test("un negativo ajustado solo se soluciona con inventario posterior y sin existencia negativa",async()=>{
  const a=await user(),ops=new NegativeOperations(db,a.access),b=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Verificación de ajuste"}});
  const product=await db.producto.create({data:{codigoBarra:randomUUID(),descripcion:"Producto verificado"}});
  let n=await db.negativo.create({data:{bodegaId:b.id,productoId:product.id,primeraDeteccion:new Date(),ultimaDeteccion:new Date(),estado:"AJUSTE_AUTORIZADO",conteoFisico:"0",existenciaSistemaConteo:"-2",motivo:"ROTACION"}});
  const edit=async(estado,extra={})=>{n=await ops.editar(n.id,{bodegaId:b.id,version:n.version,estado,conteoFisico:"0",motivo:"ROTACION",documentoRelacionado:"",veredicto:"",numeroAjuste:"AJ-1",observaciones:"",...extra});return n;};
  await assert.rejects(ops.editar(n.id,{bodegaId:b.id,version:n.version,estado:"SOLUCIONADO",conteoFisico:"0",motivo:"ROTACION",documentoRelacionado:"",veredicto:"",numeroAjuste:"AJ-1",observaciones:""}),{status:422,code:"CAMBIO_NO_PERMITIDO"});
  await edit("AJUSTE_REALIZADO");
  const inventario=async(fechaConsulta,existencia)=>{const consulta=await db.consultaInventario.create({data:{usuarioId:a.id,nombreArchivo:"verificacion.csv",fechaConsulta,fechaImportacion:new Date(Date.now()+86_400_000),hashArchivo:randomUUID().replaceAll("-","")+randomUUID().replaceAll("-",""),totalFilas:1}});await db.inventarioActual.deleteMany({where:{productoId:product.id}});await db.inventarioActual.create({data:{consultaId:consulta.id,productoId:product.id,existencia,activo:true}});};
  await inventario(new Date(Date.now()-3_600_000),"0");
  await assert.rejects(ops.editar(n.id,{bodegaId:b.id,version:n.version,estado:"SOLUCIONADO",conteoFisico:"0",motivo:"ROTACION",documentoRelacionado:"",veredicto:"",numeroAjuste:"AJ-1",observaciones:""}),{status:422,code:"VERIFICACION_PENDIENTE",message:/anterior al ajuste/});
  await inventario(new Date(Date.now()+3_600_000),"-1");
  await assert.rejects(ops.editar(n.id,{bodegaId:b.id,version:n.version,estado:"SOLUCIONADO",conteoFisico:"0",motivo:"ROTACION",documentoRelacionado:"",veredicto:"",numeroAjuste:"AJ-1",observaciones:""}),{status:422,code:"VERIFICACION_PENDIENTE",message:/Sigue en/});
  await inventario(new Date(Date.now()+3_600_000),"0");
  assert.equal((await edit("SOLUCIONADO")).estado,"SOLUCIONADO");
});
test("API administrativa: todas las rutas protegidas, CSRF, solo lectura de auditoría y entrada estricta",async()=>{
  const viewer=await user([{rol:"AUDITORIA",ubicacionId:null}]);
  for(const path of ["usuarios","entidades","auditoria"]) assert.equal((await api(path)).status,401);
  for(const path of ["usuarios","entidades"]) assert.equal((await api(path,viewer)).status,403);
  assert.equal((await api("auditoria",viewer)).status,200);
  for(const path of ["usuarios","usuarios/estado","usuarios/password","usuarios/reasignar","entidades","entidades/vinculos"])assert.equal((await api(path,null,{})).status,401,path);
  const a=await user();
  assert.equal((await POST(request("/api/admin/usuarios",a,{},"POST","https://attacker.test"),{params:Promise.resolve({path:["usuarios"]})})).status,403);
  assert.equal((await api("auditoria",a,{},"PATCH")).status,404);
  assert.equal((await api("usuarios?take=101",a)).status,422);
  assert.equal((await api("usuarios",viewer,{email:"blocked@example.test",nombre:"Bloqueado",passwordTemporal:secret(),asignaciones:[],motivo})).status,403);
});
test("cuenta temporal: hash, unicidad sin distinción de mayúsculas, cambio obligatorio y secreto ausente en API/auditoría",async()=>{
  const a=await user(),password=secret(),email=`${randomUUID()}@example.test`;
  const region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región de cuenta",tipo:"REGION",motivo});
  const store=await a.service.createEntity({codigo:randomUUID(),nombre:"Tienda de cuenta",tipo:"TIENDA",ubicacionId:region.id,motivo});
  await assert.rejects(a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Sin región",passwordTemporal:secret(),asignaciones:[{rol:"MEJORA_CONTINUA",ubicacionId:null}],motivo}),{status:422,code:"REGION"});
  await assert.rejects(a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Tienda mal enlazada",passwordTemporal:secret(),asignaciones:[{rol:"TIENDA",ubicacionId:region.id}],motivo}),{status:422,code:"TIENDA"});
  const input={email,nombre:"Temporal",passwordTemporal:password,asignaciones:[{rol:"TIENDA",ubicacionId:store.id}],motivo};
  const response=await api("usuarios",a,input);assert.equal(response.status,200);const created=(await response.json()).data;
  assert.equal(created.estado,"INVITADO");assert.equal("passwordHash" in created,false);assert.equal("passwordTemporal" in created,false);
  const stored=await db.usuario.findUniqueOrThrow({where:{id:created.id}});assert.ok(await verifyPassword(password,stored.passwordHash));
  assert.equal((await api("usuarios",a,{...input,email:email.toUpperCase()})).status,409);
  const auth=new AuthService(db),login=await auth.login({email,password});assert.equal(login.debeCambiarPassword,true);
  await assert.rejects(new Administration(db,created.id).users({}),{status:403});
  const permanent=secret();await auth.changePassword(login.token,{actual:password,nueva:permanent});
  await assert.rejects(auth.login({email,password}),{status:401});
  const session=await auth.login({email,password:permanent});assert.equal(session.debeCambiarPassword,false);
  const temporary2=secret();await a.service.password({id:created.id,passwordTemporal:temporary2,motivo});assert.equal(await auth.session(session.token),null);
  await assert.rejects(auth.login({email,password:permanent}),{status:401});
  const next=await auth.login({email,password:temporary2});await auth.changePassword(next.token,{actual:temporary2,nueva:secret()});await assert.rejects(auth.login({email,password:temporary2}),{status:401});
  const audits=JSON.stringify((await a.service.auditLog({entidadId:created.id})).rows);
  for(const s of [password,permanent,temporary2,stored.passwordHash])assert.equal(audits.includes(s),false);
});
test("cambio de alcance revoca sesiones y se aplica inmediatamente; versiones y autoelevación",async()=>{
  const a=await user(),region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región",tipo:"REGION",motivo});
  const stores=[];for(let i=0;i<2;i++)stores.push(await a.service.createEntity({codigo:randomUUID(),nombre:`Tienda ${i}`,tipo:"TIENDA",ubicacionId:region.id,motivo}));
  const warehouses=[];for(const s of stores)warehouses.push(await db.bodega.create({data:{codigo:randomUUID(),nombre:s.nombre,ubicacionId:s.id}}));
  const u=await user([{rol:"TIENDA",ubicacionId:stores[0].id}]);
  await u.access.warehouse("negativos.editar",warehouses[0].id);
  await a.service.editUser(edit(u,[{rol:"TIENDA",ubicacionId:stores[1].id}]));
  assert.equal(await new AuthService(db).session(u.token),null);
  await assert.rejects(u.access.warehouse("negativos.editar",warehouses[0].id),{status:403});await u.access.warehouse("negativos.editar",warehouses[1].id);
  await assert.rejects(a.service.editUser(edit(u,[])),{status:409,code:"VERSION"});
  await assert.rejects(a.service.editUser(edit(a,[{rol:"ADMINISTRADOR",ubicacionId:null},{rol:"TIENDA",ubicacionId:null}])),{status:403,code:"AUTOELEVACION"});
});
test("mejora continua sin administración no puede otorgar ni restablecer cuentas superiores",async()=>{
    const limited=await user([{rol:"MEJORA_CONTINUA",ubicacionId:null}]),a=await user();
    await assert.rejects(limited.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Superior",passwordTemporal:secret(),asignaciones:[{rol:"ADMINISTRADOR",ubicacionId:null}],motivo}),{status:403});
    await assert.rejects(limited.service.editUser(edit(a,[])),{status:403});
    await assert.rejects(limited.service.password({id:a.id,passwordTemporal:secret(),motivo}),{status:403});
    await assert.rejects(limited.service.status({id:a.id,estado:"INACTIVO",motivo}),{status:403});
});
test("mejora continua regional puede trabajar la bodega técnica de negativos sin abrir otras regiones",async()=>{
  const region=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Región MC",tipo:"REGION"}}),otherRegion=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Otra región",tipo:"REGION"}});
  const otherLocation=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Bodega ajena",tipo:"BODEGA",regionId:otherRegion.id}});
  const general=await db.bodega.create({data:{codigo:"PDMC_GENERAL",nombre:"Negativos generales"}}),other=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Bodega regional ajena",ubicacionId:otherLocation.id}});
  const mc=await user([{rol:"MEJORA_CONTINUA",ubicacionId:region.id}]),scope=await mc.access.filter("negativos.leer");
  const visible=await db.bodega.findMany({where:{id:scope},select:{id:true}}),ids=new Set(visible.map(row=>row.id));
  assert.equal(ids.has(general.id),true);assert.equal(ids.has(other.id),false);
});
test("catálogo de tiendas, vínculos con acceso directo y eliminación segura de entidades",async()=>{
  const a=await user(),one=await user([]),two=await user([]),count=await db.usuario.count(),contexts=await db.bodega.count();
  const region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región operativa",tipo:"REGION",motivo});
  const warehouse=await a.service.createEntity({codigo:randomUUID(),nombre:`Bodega ${randomUUID()}`,tipo:"BODEGA",ubicacionId:region.id,motivo});
  const store=await a.service.createEntity({codigo:randomUUID(),nombre:"Tienda operativa",tipo:"TIENDA",ubicacionId:region.id,motivo});
  const regional=await a.service.entities({clase:"ubicaciones",regionId:region.id,take:25});
  assert.deepEqual(new Set(regional.rows.map(row=>row.id)),new Set([warehouse.id,store.id]));
  await assert.rejects(a.service.createEntity({codigo:randomUUID(),nombre:"Perfil impropio",tipo:"FACTURACION",motivo}));
  await assert.rejects(a.service.entities({clase:"perfiles",take:25}));
  await a.service.link({id:store.id,clase:"ubicaciones",usuarios:[one.id,two.id],motivo});
  assert.equal(await db.usuario.count(),count);assert.equal(await db.bodega.count(),contexts);
  assert.ok(await db.bodegaProducto.findUnique({where:{nombre:warehouse.nombre}}));
  assert.equal(await db.tienda.count({where:{ubicacionId:store.id,activa:true}}),1);
  assert.equal((await one.access.grants()).some(g=>g.rol==="TIENDA"&&g.ubicacionId===store.id),true);
  await a.service.link({id:store.id,clase:"ubicaciones",usuarios:[two.id],motivo});
  assert.equal((await one.access.grants()).some(g=>g.rol==="TIENDA"&&g.ubicacionId===store.id),false);
  await assert.rejects(a.service.updateEntity({id:store.id,clase:"ubicaciones",nombre:"Tienda sin región",ubicacionId:null,activa:false,motivo}),{status:422,code:"REGION"});
  await a.service.updateEntity({id:store.id,clase:"ubicaciones",nombre:"Tienda operativa editada",ubicacionId:region.id,activa:false,motivo});
  assert.deepEqual(await db.tienda.findUnique({where:{ubicacionId:store.id},select:{nombre:true,activa:true}}),{nombre:"Tienda operativa editada",activa:false});
  await assert.rejects(a.service.deleteEntity({id:store.id,clase:"ubicaciones",motivo,confirmacion:"ELIMINAR"}),{status:409});
  await a.service.link({id:store.id,clase:"ubicaciones",usuarios:[],motivo});
  await a.service.deleteEntity({id:store.id,clase:"ubicaciones",motivo,confirmacion:"ELIMINAR"});
  assert.equal(await db.ubicacion.count({where:{id:store.id}}),0);assert.equal(await db.tienda.count({where:{ubicacionId:store.id}}),0);
  await assert.rejects(a.service.createEntity({codigo:randomUUID(),nombre:"Inválida",tipo:"TIENDA",ubicacionId:store.id,motivo}),{status:422});
});
test("el usuario de facturación exige un código corporativo único y queda vinculado en la misma operación",async()=>{
  const a=await user(),region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región facturación",tipo:"REGION",motivo});
  const billingCode=randomUUID().toUpperCase(),storeCode=`T-${randomUUID()}`.toUpperCase();
  const assignments=[{rol:"FACTURACION",ubicacionId:region.id}];
  await assert.rejects(a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Sin código",passwordTemporal:secret(),asignaciones:assignments,motivo}),{status:422,code:"PERFIL_FACTURACION"});
  const imported=await db.transferenciaConsultaImport.create({data:{nombreArchivo:"antes-del-usuario.csv",hashArchivo:randomBytes(32).toString("hex"),totalFilas:1,resumen:{total:1}}});
  const transferNumber=randomUUID();
  await db.transferenciaConsulta.create({data:{numero:transferNumber,fecha:new Date("2026-10-01T00:00:00Z"),codigoFacturador:billingCode,codigoTiendaConsulta:storeCode,estado:"Exportada",unidades:1,cantidadCodigos:1,ultimaImportacionId:imported.id}});
  const created=await a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Facturador",passwordTemporal:secret(),asignaciones:assignments,codigoFacturador:billingCode,motivo});
  const store=await a.service.createEntity({codigo:storeCode,nombre:"Tienda creada después de la consulta",tipo:"TIENDA",ubicacionId:region.id,motivo});
  const profile=await db.perfilLaboral.findUniqueOrThrow({where:{codigo:billingCode}});
  assert.equal(created.vinculosOperativos[0].perfil.codigo,billingCode);
  assert.equal(await db.vinculoOperativo.count({where:{usuarioId:created.id,perfilId:profile.id}}),1);
  const linkedTransfer=await db.transferenciaConsulta.findFirstOrThrow({where:{numero:transferNumber}});
  assert.equal(linkedTransfer.facturadorId,profile.id);assert.equal(linkedTransfer.tiendaId,store.id);
  await assert.rejects(a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Duplicado",passwordTemporal:secret(),asignaciones:assignments,codigoFacturador:billingCode,motivo}),{status:409,code:"PERFIL_EN_USO"});
});
test("la consulta enlaza manualmente tienda, facturador y región por sus códigos estables",async()=>{
  const a=await user(),region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región enlazada",tipo:"REGION",motivo});
  const storeCode=`T-${randomUUID()}`.toUpperCase(),billingCode=`F-${randomUUID()}`.toUpperCase();
  const store=await a.service.createEntity({codigo:storeCode,nombre:"Tienda enlazada",tipo:"TIENDA",ubicacionId:region.id,motivo});
  const biller=await a.service.createUser({email:`${randomUUID()}@example.test`,nombre:"Facturador enlazado",passwordTemporal:secret(),asignaciones:[{rol:"FACTURACION",ubicacionId:region.id}],codigoFacturador:billingCode,motivo});
  const product=await db.producto.create({data:{codigoBarra:`CB-${randomUUID()}`,descripcion:"Producto del detalle"}});
  const number=`T${Date.now()}`,csv=`Numero;fecha_formateada;CodNombre;CodigoBarra;Cantidad;NumeroCaja;codigoRecibe_Dletra;status;observacion\n${number};10/01/2026;${billingCode};${product.codigoBarra};12;1;${storeCode};Exportada;Normal`;
  // El resumen también informa insertadas, actualizadas y bajas (las de pruebas anteriores en el mismo esquema).
  const imported=await new TransferQueryService(db).import("enlaces.csv",csv),{total,filasDetalle,abiertas,aprobadas,exportadas,sinTienda,sinFacturador,sinProducto,insertadas}=imported.resumen;
  assert.deepEqual({total,filasDetalle,abiertas,aprobadas,exportadas,sinTienda,sinFacturador,sinProducto,insertadas},{total:1,filasDetalle:1,abiertas:0,aprobadas:0,exportadas:1,sinTienda:0,sinFacturador:0,sinProducto:0,insertadas:1});
  const transfer=await db.transferenciaConsulta.findFirstOrThrow({where:{numero:number},include:{tienda:true,facturador:{include:{vinculos:true}},detalles:true}});
  assert.equal(transfer.tiendaId,store.id);assert.equal(transfer.tienda?.regionId,region.id);assert.equal(transfer.facturador?.codigo,billingCode);assert.equal(transfer.facturador?.vinculos[0].usuarioId,biller.id);
  assert.equal(transfer.unidades,12);assert.equal(transfer.cantidadCodigos,1);assert.equal(transfer.detalles[0].productoId,product.id);
});
test("devoluciones importa una fila por devolución y respeta el alcance regional",async()=>{
  const a=await user(),region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región devoluciones",tipo:"REGION",motivo}),storeCode=`D-${randomUUID()}`.toUpperCase(),billingCode=`R-${randomUUID()}`.toUpperCase();
  const store=await a.service.createEntity({codigo:storeCode,nombre:"Tienda devolución",tipo:"TIENDA",ubicacionId:region.id,motivo});
  await db.perfilLaboral.create({data:{codigo:billingCode,nombre:"Responsable devolución",tipo:"FACTURACION",ubicacionId:region.id}});
  const number=`D${Date.now()}`,sinVincular=`D${Date.now()}X`,head="Numero;fecha_formateada;CodNombre;usuario;codigoRecibe_Dletra;status;Observacion;TotalValor;DocumentoOrigen";
  const csv=valor=>`${head}\n${number};10/01/2026;${billingCode};RESPONSABLE SQL;${storeCode};Abierta;Devolución de prueba;${valor};98765\n${sinVincular};10/01/2026;NO-EXISTE;MARIA PEREZ;${storeCode};Exportada;;;`;
  const imported=await new ReturnsService(db,a.access).import("devoluciones.csv",csv("1234.50"));
  assert.deepEqual(imported.resumen,{total:2,abiertas:1,aprobadas:0,exportadas:1,sinTienda:0,sinResponsable:1,insertadas:2,actualizadas:0,bajas:0,sinCambios:0});
  // Mismo valor con otra escritura (1234.5): no cuenta como cambio.
  const again=await new ReturnsService(db,a.access).import("devoluciones.csv",csv("1234.5"));
  assert.equal(again.resumen.actualizadas,0);assert.equal(again.resumen.sinCambios,2);
  const changed=await new ReturnsService(db,a.access).import("devoluciones.csv",csv("99.10"));
  assert.equal(changed.resumen.actualizadas,1);
  const regional=await user([{rol:"MEJORA_CONTINUA",ubicacionId:region.id}]),result=await new ReturnsService(db,regional.access).list();
  const linked=result.rows.find(row=>row.numero===number),unlinked=result.rows.find(row=>row.numero===sinVincular);
  assert.equal(result.rows.length,2);assert.equal(linked.tienda,store.nombre);assert.equal(linked.responsable,"Responsable devolución");
  assert.equal(linked.totalValor,99.1);assert.equal(linked.documentoOrigen,"98765");
  // Sin facturador vinculado se muestra el nombre que trae SQL Server; sin valor ni documento, null.
  assert.equal(unlinked.responsable,"MARIA PEREZ");assert.equal(unlinked.totalValor,null);assert.equal(unlinked.documentoOrigen,null);assert.equal(unlinked.observacion,"");
  const detail=await new ReturnsService(db,regional.access).detail(number);
  assert.equal(detail.codigoTienda,storeCode);assert.equal(detail.codigoResponsable,billingCode);
});
test("devoluciones acepta el estado Aprobada y rechaza estados, valores y números repetidos inválidos",async()=>{
  const a=await user(),region=await a.service.createEntity({codigo:randomUUID(),nombre:"Región aprobadas",tipo:"REGION",motivo}),storeCode=`A-${randomUUID()}`.toUpperCase(),billingCode=`P-${randomUUID()}`.toUpperCase();
  await a.service.createEntity({codigo:storeCode,nombre:"Tienda aprobada",tipo:"TIENDA",ubicacionId:region.id,motivo});
  await db.perfilLaboral.create({data:{codigo:billingCode,nombre:"Responsable aprobada",tipo:"FACTURACION",ubicacionId:region.id}});
  const number=`A${Date.now()}`,line=`${number};10/01/2026;${billingCode};USUARIO;${storeCode};Aprobada;Devolución aprobada;10;55`,csv=`Numero;fecha_formateada;CodNombre;usuario;codigoRecibe_Dletra;status;Observacion;TotalValor;DocumentoOrigen\n${line}`;
  const imported=await new ReturnsService(db,a.access).import("devoluciones.csv",csv);assert.equal(imported.resumen.aprobadas,1);
  assert.equal((await db.devolucionConsulta.findFirstOrThrow({where:{numero:number}})).estado,"Aprobada");
  await assert.rejects(new ReturnsService(db,a.access).import("devoluciones.csv",csv.replace(";Aprobada;",";Desconocido;")),{code:"ESTADO"});
  await assert.rejects(new ReturnsService(db,a.access).import("devoluciones.csv",csv.replace(";10;55",";diez;55")),{code:"VALOR"});
  await assert.rejects(new ReturnsService(db,a.access).import("devoluciones.csv",`${csv}\n${line}`),{code:"DUPLICADO"});
  // El formato anterior (con detalle por producto y caja) se rechaza entero.
  await assert.rejects(new ReturnsService(db,a.access).import("devoluciones.csv","Numero;fecha_formateada;CodNombre;CodigoBarra;Cantidad;NumeroCaja;codigoRecibe_Dletra;status;Observacion\nX;10/01/2026;A;1;1;1;B;Abierta;C"),{code:"ENCABEZADOS"});
});
test("desactivar y transferir: alcance receptor, pendientes, historial, revocación y rollback auditado",async()=>{
  const a=await user(),source=await user([{rol:"TIENDA",ubicacionId:null}]),receiver=await user([{rol:"TIENDA",ubicacionId:null}]),denied=await user([]);
  const b=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Casos generales"}});
  const cases=[];for(const estado of ["EN_INVESTIGACION","AJUSTE_AUTORIZADO","SOLUCIONADO"])cases.push(await db.negativo.create({data:{bodega:{connect:{id:b.id}},producto:{create:{codigoBarra:randomUUID()}},responsable:{connect:{id:source.id}},estado,primeraDeteccion:new Date(),ultimaDeteccion:new Date()}}));
  await assert.rejects(a.service.status({id:source.id,estado:"INACTIVO",transferirA:denied.id,motivo}),{status:403});
  assert.equal((await db.usuario.findUniqueOrThrow({where:{id:source.id}})).estado,"ACTIVO");
  await sql.query(`CREATE FUNCTION reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='ESTADO_USUARIO_CAMBIADO' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END; $$`);
  await sql.query(`CREATE TRIGGER reject_admin_audit BEFORE INSERT ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION reject_admin_audit()`);
  try {await assert.rejects(a.service.status({id:source.id,estado:"INACTIVO",transferirA:receiver.id,motivo}));assert.equal(await db.negativo.count({where:{responsableId:receiver.id}}),0);assert.ok(await new AuthService(db).session(source.token));}
  finally {await sql.query(`DROP TRIGGER reject_admin_audit ON "Auditoria"`)}
  const result=await a.service.status({id:source.id,estado:"INACTIVO",transferirA:receiver.id,motivo});assert.equal(result.transferidos,2);
  assert.equal(await new AuthService(db).session(source.token),null);
  assert.equal((await db.negativo.findUniqueOrThrow({where:{id:cases[2].id}})).responsableId,source.id);
  assert.equal(await db.historialNegativo.count({where:{accion:"RESPONSABLE_TRANSFERIDO",usuarioId:a.id}}),2);
  await a.service.status({id:source.id,estado:"ACTIVO",motivo});assert.equal((await db.usuario.findUniqueOrThrow({where:{id:source.id}})).activo,true);
});
test("último administrador activo protegido incluso con invitado; concurrencia no deja cero administradores",async()=>{
  // Sólo se alteran cuentas del esquema de esta prueba.
  await db.asignacionAcceso.deleteMany({where:{rol:"ADMINISTRADOR"}});
  const only=await user(),invited=await user(undefined,{estado:"INVITADO",debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+3600000)});
  await assert.rejects(only.service.status({id:only.id,estado:"INACTIVO",motivo}),{status:403});
  await assert.rejects(only.service.password({id:only.id,passwordTemporal:secret(),motivo}),{status:403});
  await assert.rejects(db.$transaction(async tx=>{
    await tx.usuario.update({where:{id:only.id},data:{estado:"INACTIVO"}});
    await ensureActiveAdministrator(tx);
  }),{status:409,code:"ULTIMO_ADMIN"});
  assert.equal((await db.usuario.findUniqueOrThrow({where:{id:only.id}})).estado,"ACTIVO");
  assert.equal((await db.usuario.findUniqueOrThrow({where:{id:invited.id}})).estado,"INVITADO");
  const second=await user();
  const result=await Promise.allSettled([only.service.status({id:second.id,estado:"INACTIVO",motivo}),second.service.status({id:only.id,estado:"INACTIVO",motivo})]);
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(await db.usuario.count({where:{id:{in:[only.id,second.id]},estado:"ACTIVO",activo:true}}),1);
});
test("auditoría inmutable, filtros/paginación y actor/origen/antes/después en operaciones críticas de negativos",async()=>{
  const a=await user(),b=await db.bodega.create({data:{codigo:randomUUID(),nombre:"Auditoría negativos"}});
  const context=path=>({params:Promise.resolve({path:path.split("/")})});
  const neg=async(path,body,method="POST")=>(method==="PATCH"?negativePatch:negativePost)(request(`/api/operacion/negativos/${path}`,a,body,method),context(path));
  const product=await db.producto.create({data:{codigoBarra:randomUUID(),descripcion:"Producto auditado"}});
  let n=await db.negativo.create({data:{bodegaId:b.id,productoId:product.id,primeraDeteccion:new Date(),ultimaDeteccion:new Date()}});
  assert.equal((await neg(`casos/${n.id}`,{bodegaId:b.id,version:n.version,estado:"EN_INVESTIGACION",conteoFisico:"",motivo:"ROTACION",documentoRelacionado:"",veredicto:"",numeroAjuste:"",observaciones:"Auditado"},"PATCH")).status,200);
  n=await db.negativo.findUniqueOrThrow({where:{id:n.id}});
  // La edición masiva usa el mismo catálogo de motivos que el caso individual.
  assert.equal((await neg("lista/estado",{casos:[{id:n.id,version:n.version}],motivo:"Motivo compartido"})).status,422);
  assert.equal((await neg("lista/estado",{casos:[{id:n.id,version:n.version}],motivo:"ERROR POR INVENTARIO INICIAL"})).status,200);
  n=await db.negativo.findUniqueOrThrow({where:{id:n.id}});
  assert.equal((await neg(`casos/${n.id}/anular`,{bodegaId:b.id,version:n.version,motivo})).status,200);
  for(const accion of ["EDITAR_SEGUIMIENTO","ESTADO_MASIVO","ANULAR_CASO"]) {
    const event=await db.auditoria.findFirstOrThrow({where:{accion,usuarioId:a.id}});assert.match(event.origen,/^WEB (POST|PATCH) \/api\/operacion\/negativos\//);assert.ok(event.valorAnterior);assert.ok(event.valorNuevo);
  }
  const page=await a.service.auditLog({usuarioId:a.id,take:2});assert.equal(page.rows.length,2);assert.ok(page.total>=3);
  const next=await a.service.auditLog({usuarioId:a.id,take:2,skip:2});assert.ok(!next.rows.some(n=>page.rows.some(p=>p.id===n.id)));
  const filtered=await a.service.auditLog({usuarioId:a.id,accion:"ANULAR_CASO",entidadId:n.id});assert.equal(filtered.total,1);
  await assert.rejects(db.auditoria.update({where:{id:page.rows[0].id},data:{motivo:"Alterado"}}));await assert.rejects(db.auditoria.delete({where:{id:page.rows[0].id}}));
  assert.equal((await api("auditoria",a,{id:page.rows[0].id},"PATCH")).status,404);
});


test("Control y Seguimiento envia observaciones al facturador enlazado y este confirma su atencion",async()=>{
  const admin=await user(),region=await admin.service.createEntity({codigo:randomUUID(),nombre:"Region facturacion",tipo:"REGION",motivo});
  const control=await user([{rol:"MEJORA_CONTINUA",ubicacionId:region.id}]),facturador=await user([{rol:"FACTURACION",ubicacionId:region.id}]);
  const perfil=await db.perfilLaboral.create({data:{codigo:`FAC-${randomUUID()}`,nombre:"Facturador de prueba",tipo:"FACTURACION",vinculos:{create:{usuarioId:facturador.id}}}});
  const controlService=new BillingObservationService(db,control.access),facturadorService=new BillingObservationService(db,facturador.access);
  const created=await controlService.create({perfilId:perfil.id,titulo:"Validar preparacion",detalle:"Revise las cantidades antes de exportar la transferencia.",prioridad:"ALTA"});
  assert.equal(created.estado,"PENDIENTE");assert.equal(created.perfil.codigo,perfil.codigo);
  const inbox=await facturadorService.list({perfilId:perfil.id});assert.equal(inbox.canCreate,false);assert.equal(inbox.observations.some(item=>item.id===created.id),true);
  const attended=await facturadorService.updateStatus({id:created.id,estado:"ATENDIDA"});assert.equal(attended.estado,"ATENDIDA");assert.ok(attended.leidaAt);assert.ok(attended.atendidaAt);
  await assert.rejects(facturadorService.create({perfilId:perfil.id,titulo:"No permitido",detalle:"El facturador no crea observaciones.",prioridad:"MEDIA"}),{status:403});
  const audit=await db.auditoria.findFirstOrThrow({where:{entidad:"ObservacionFacturador",entidadId:created.id,accion:"CREAR_OBSERVACION_MEJORA"}});assert.equal(audit.usuarioId,control.id);
});


test("administracion asigna varias tiendas sin region en una operacion auditada",async()=>{
  const admin=await user(),region=await admin.service.createEntity({codigo:randomUUID(),nombre:"Region masiva",tipo:"REGION",motivo});
  await db.$executeRawUnsafe('ALTER TABLE "Ubicacion" DROP CONSTRAINT "Ubicacion_region_obligatoria_check"');
  const first=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Tienda pendiente 1",tipo:"TIENDA"}});
  const second=await db.ubicacion.create({data:{codigo:randomUUID(),nombre:"Tienda pendiente 2",tipo:"TIENDA"}});
  await db.$executeRawUnsafe(`ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_region_obligatoria_check" CHECK ((tipo = 'REGION' AND "regionId" IS NULL) OR (tipo IN ('TIENDA', 'BODEGA') AND "regionId" IS NOT NULL)) NOT VALID`);
  const result=await admin.service.assignStoresRegion({tiendaIds:[first.id,second.id],regionId:region.id,motivo:"Clasificacion territorial inicial"});
  assert.equal(result.actualizadas,2);
  assert.equal(await db.ubicacion.count({where:{id:{in:[first.id,second.id]},regionId:region.id}}),2);
  assert.equal(await db.auditoria.count({where:{entidad:"Ubicacion",entidadId:{in:[first.id,second.id]},accion:"REGION_ASIGNADA_MASIVO"}}),2);
  await assert.rejects(admin.service.assignStoresRegion({tiendaIds:[first.id],regionId:region.id,motivo:"Intento repetido controlado"}),{status:409,code:"REGION"});
});


test("eliminar explica el historial que impide eliminar una tienda",async()=>{
  const admin=await user(),region=await admin.service.createEntity({codigo:randomUUID(),nombre:"Region con historial",tipo:"REGION",motivo});
  const store=await admin.service.createEntity({codigo:randomUUID(),nombre:"Tienda con transferencias",tipo:"TIENDA",ubicacionId:region.id,motivo});
  const imported=await db.transferenciaConsultaImport.create({data:{nombreArchivo:"prueba.csv",hashArchivo:randomBytes(32).toString("hex"),totalFilas:1,resumen:{total:1}}});
  await db.transferenciaConsulta.create({data:{numero:randomUUID(),fecha:new Date("2026-10-01T00:00:00Z"),codigoFacturador:"PRUEBA",codigoTiendaConsulta:store.codigo,tiendaId:store.id,estado:"Exportada",unidades:1,cantidadCodigos:1,ultimaImportacionId:imported.id}});
  await assert.rejects(admin.service.deleteEntity({id:store.id,clase:"ubicaciones",motivo,confirmacion:"ELIMINAR"}),error=>error.status===409&&error.code==="ENTIDAD_EN_USO"&&/1 transferencias cargadas/.test(error.message));
});
