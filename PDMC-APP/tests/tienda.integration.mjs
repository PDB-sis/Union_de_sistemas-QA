import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {GET,POST} from "../app/api/tienda/route.ts";
import {GET as INCONSISTENCY_GET} from "../app/api/inconsistencias/route.ts";

nextEnv.loadEnvConfig(process.cwd());
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_store_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
let originalDb,originalOrigin;

before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  for(const migration of (await readdir(new URL('../prisma/migrations',import.meta.url),{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
    const sql=await readFile(new URL(`../prisma/migrations/${migration.name}/migration.sql`,import.meta.url),'utf8');
    await admin.query(sql.replaceAll('"public"',`"${schema}"`));
  }
  originalDb=globalThis.pdmcDb;globalThis.pdmcDb=db;
  originalOrigin=process.env.PDMC_AUTH_ORIGIN;process.env.PDMC_AUTH_ORIGIN='https://pdmc.example.test';
});

after(async()=>{
  if(originalDb===undefined)delete globalThis.pdmcDb;else globalThis.pdmcDb=originalDb;
  if(originalOrigin===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=originalOrigin;
  await db.$disconnect();
  if(!/^pdmc_store_[a-f0-9]{32}$/.test(schema))throw new Error('Esquema de prueba inválido.');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});

async function account(store){
  const user=await db.usuario.create({data:{email:`${randomUUID()}@store.test`,nombre:'Usuario tienda',estado:'ACTIVO',debeCambiarPassword:false,asignaciones:{create:{rol:'TIENDA',ubicacionId:store.id}}}});
  const token=randomBytes(32).toString('base64url');
  await db.sesionUsuario.create({data:{usuarioId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600_000)}});
  return {...user,cookie:`__Host-pdmc-session=${token}`};
}

function request(action,user,body){
  return new Request(`https://pdmc.example.test/api/tienda?accion=${action}`,{method:body===undefined?'GET':'POST',headers:{Origin:'https://pdmc.example.test',...(user?{cookie:user.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}

async function payload(response){const body=await response.json();return {response,body};}

test('API de Tienda: permisos, territorio, cruce atómico, auditoría, idempotencia y rollback',async()=>{
  const region=await db.ubicacion.create({data:{codigo:'REGION-TEST',nombre:'Región de prueba',tipo:'REGION'}});
  const storeA=await db.ubicacion.create({data:{codigo:'CARIBE-TEST',nombre:'C.C. CARIBE ZULIA (HECTOR YARCE)',tipo:'TIENDA',regionId:region.id}});
  const storeB=await db.ubicacion.create({data:{codigo:'REDOMA-TEST',nombre:'C.C. REDOMA - PANTY (MARIA)',tipo:'TIENDA',regionId:region.id}});
  const [userA,userB]=await Promise.all([account(storeA),account(storeB)]);
  const [productA,productB,productC]=await Promise.all([
    db.producto.create({data:{codigoBarra:'6900000000001',referencia:'A',descripcion:'Producto original',linea:'Dama',marca:'Marca A'}}),
    db.producto.create({data:{codigoBarra:'6900000000002',referencia:'REFERENCIA-COMPARTIDA',descripcion:'Producto cruzado',linea:'Caballero',marca:'Marca B'}}),
    db.producto.create({data:{codigoBarra:'6900000000003',referencia:'REFERENCIA-COMPARTIDA',descripcion:'Segundo producto cruzado',linea:'Caballero',marca:'Marca B'}}),
  ]);
  const inventoryImport=await db.consultaInventario.create({data:{usuarioId:userA.id,nombreArchivo:'inventario-prueba.csv',fechaConsulta:new Date('2026-06-22T00:00:00Z'),hashArchivo:createHash('sha256').update('inventario-'+randomUUID()).digest('hex'),totalFilas:2}});
  await db.inventarioActual.createMany({data:[
    {consultaId:inventoryImport.id,productoId:productA.id,existencia:10,activo:true},
    {consultaId:inventoryImport.id,productoId:productB.id,existencia:10,activo:true},
    {consultaId:inventoryImport.id,productoId:productC.id,existencia:10,activo:true},
  ]});
  const transferImport=await db.transferenciaConsultaImport.create({data:{nombreArchivo:'consulta-prueba.csv',hashArchivo:createHash('sha256').update(randomUUID()).digest('hex'),totalFilas:4,resumen:{total:4,exportadas:4}}});
  await db.transferenciaConsulta.createMany({data:[
    {numero:'78749',fecha:new Date('2026-06-22T00:00:00Z'),codigoFacturador:'DANMARY',codigoTiendaConsulta:storeA.codigo,tiendaId:storeA.id,estado:'Exportada',observacion:'Transferencia de corrección',unidades:83,cantidadCodigos:12,ultimaImportacionId:transferImport.id},
    {numero:'78755',fecha:new Date('2026-06-22T00:00:00Z'),codigoFacturador:'DANMARY',codigoTiendaConsulta:storeB.codigo,tiendaId:storeB.id,estado:'Exportada',observacion:'Rotación de mercancía',unidades:77,cantidadCodigos:11,ultimaImportacionId:transferImport.id},
    {numero:'78756',fecha:new Date('2026-06-22T00:00:00Z'),codigoFacturador:'DANMARY',codigoTiendaConsulta:storeB.codigo,tiendaId:storeB.id,estado:'Exportada',observacion:'Prueba mixta',unidades:20,cantidadCodigos:3,ultimaImportacionId:transferImport.id},
    {numero:'78757',fecha:new Date('2026-06-22T00:00:00Z'),codigoFacturador:'DANMARY',codigoTiendaConsulta:storeA.codigo,tiendaId:storeA.id,estado:'Exportada',observacion:'Prueba de rollback',unidades:10,cantidadCodigos:1,ultimaImportacionId:transferImport.id},
  ]});

  assert.equal((await GET(request('inicio'))).status,401);
  const start=await payload(await GET(request('inicio',userA)));
  assert.equal(start.response.status,200);assert.equal(start.body.data.stores.length,1);assert.equal(start.body.data.stores[0].id,storeA.id);
  assert.ok(start.body.data.transfers.some(item=>item.id==='78749'));
  const correction=start.body.data.transfers.find(item=>item.id==='78749');
  assert.equal(correction.type,'CORRECCION');assert.equal(correction.description,'Transferencia de corrección');assert.equal(Object.hasOwn(correction,'biller'),false);
  assert.equal(start.body.data.transfers.some(item=>item.id==='78755'),false);
  const lookup=await payload(await GET(request(`producto&codigo=${productA.codigoBarra}`,userA)));
  assert.equal(lookup.response.status,200);assert.equal(lookup.body.data.id,productA.id);
  const historical=await db.producto.create({data:{codigoBarra:'6900000000099',referencia:'H',descripcion:'Producto fuera del inventario vigente'}});
  const historicalLookup=await payload(await GET(request(`producto&codigo=${historical.codigoBarra}`,userA)));
  assert.equal(historicalLookup.response.status,404);
  const inactive=await db.producto.create({data:{codigoBarra:'6900000000098',referencia:'I',descripcion:'Producto inactivo',activo:false}});
  await db.inventarioActual.create({data:{consultaId:inventoryImport.id,productoId:inactive.id,existencia:5,activo:false}});
  const inactiveLookup=await payload(await GET(request(`producto&codigo=${inactive.codigoBarra}`,userA)));
  assert.equal(inactiveLookup.response.status,404);

  const catalog=await payload(await GET(request('catalogo-pedidos&linea=Dama&marca=Marca%20A',userA)));
  assert.equal(catalog.response.status,200);assert.equal(catalog.body.data.total,1);assert.equal(catalog.body.data.rows[0].id,productA.id);
  const createdOrder=await payload(await POST(request('pedidos',userA,{tiendaId:storeA.id,observaciones:'Reposición de prueba',items:[{productoId:productA.id,cantidad:6},{productoId:productB.id,cantidad:2}]})));
  assert.equal(createdOrder.response.status,200);assert.equal(createdOrder.body.data.estado,'ENVIADO');assert.equal(createdOrder.body.data.items.length,2);
  assert.equal((await POST(request('pedidos',userB,{tiendaId:storeA.id,items:[{productoId:productA.id,cantidad:1}]}))).status,403);
  const orderHistory=await payload(await GET(request('pedidos',userA)));assert.equal(orderHistory.body.data.length,1);assert.equal(orderHistory.body.data[0].tienda.nombre,storeA.nombre);

  const singleId=randomUUID();
  const single={solicitudId:singleId,tiendaId:storeA.id,transferencia:'78749',codigoBarra:productA.codigoBarra,motivo:'FALTANTE',submotivo:'UNIDADES_MENOS_PAQUETE',cantidad:2};
  const first=await payload(await POST(request('reportar',userA,single)));
  assert.equal(first.response.status,200);assert.equal(first.body.data.repetida,false);assert.equal(first.body.data.casos.length,1);
  const repeated=await payload(await POST(request('reportar',userA,single)));
  assert.equal(repeated.response.status,200);assert.equal(repeated.body.data.repetida,true);
  assert.equal(await db.inconsistencia.count({where:{grupoReporteId:singleId}}),1);
  assert.equal((await db.inconsistencia.findFirstOrThrow({where:{grupoReporteId:singleId}})).submotivoReporte,'UNIDADES_MENOS_PAQUETE');
  const duplicateCode=await POST(request('reportar',userA,{...single,solicitudId:randomUUID(),motivo:'SOBRANTE',submotivo:'UNIDADES_MAS_PAQUETE'}));
  assert.equal(duplicateCode.status,409);
  const appSection=await payload(await INCONSISTENCY_GET(new Request('https://pdmc.example.test/api/inconsistencias?estado=todos',{headers:{cookie:userA.cookie}})));
  assert.equal(appSection.response.status,200);assert.equal(appSection.body.data.total,1);

  const successId=randomUUID();
  const success=await payload(await POST(request('sin-incidencias',userA,{solicitudId:successId,tiendaId:storeA.id,transferencia:'78749'})));
  assert.equal(success.response.status,200);assert.equal(success.body.data.repetida,false);
  assert.equal((await POST(request('sin-incidencias',userA,{solicitudId:randomUUID(),tiendaId:storeA.id,transferencia:'78749'}))).status,200);
  assert.equal(await db.reporteTransferenciaTienda.count({where:{tiendaId:storeA.id,transferencia:'78749'}}),1);
  const afterSuccess=await payload(await GET(request('inicio',userA)));assert.equal(afterSuccess.body.data.transfers.some(item=>item.id==='78749'),false);

  const unknownId=randomUUID();
  const unknown=await payload(await POST(request('codigo-no-inventario',userA,{solicitudId:unknownId,tiendaId:storeA.id,transferencia:'78749',codigoBarraNoInventario:'9990000000000',motivo:'CODIGO_MEZCLADO_PAQUETE',codigoBarraTransferencia:productA.codigoBarra,cantidadPaquete:8,cantidadCodigoNoInventario:2})));
  assert.equal(unknown.response.status,200);assert.equal(unknown.body.data.repetida,false);
  assert.equal((await db.inconsistenciaCodigoNoInventario.findUniqueOrThrow({where:{solicitudId:unknownId}})).cantidadCodigoNoInventario,2);
  assert.equal((await POST(request('codigo-no-inventario',userA,{solicitudId:randomUUID(),tiendaId:storeA.id,transferencia:'78749',codigoBarraNoInventario:productA.codigoBarra,motivo:'OTRO',detalle:'Prueba'}))).status,409);

  const crossId=randomUUID();
  const cross={solicitudId:crossId,tiendaId:storeA.id,transferencia:'78749',codigoBarra:productB.codigoBarra,codigoCruce:productC.codigoBarra,motivo:'CRUCE',cantidad:3};
  const pairResponse=await payload(await POST(request('reportar',userA,cross)));
  assert.equal(pairResponse.response.status,200);assert.equal(pairResponse.body.data.casos.length,2);
  const pair=await db.inconsistencia.findMany({where:{grupoReporteId:crossId},orderBy:{codigoBarra:'asc'}});
  assert.equal(pair.length,2);assert.equal(pair[0].claveCruce,pair[1].claveCruce);assert.ok(pair[0].claveCruce);
  assert.deepEqual(pair.map(item=>[item.codigoBarra,item.tipoError,item.cantidadErrada]),[[productB.codigoBarra,'faltante físico',3],[productC.codigoBarra,'Sobrante físico',3]]);
  assert.equal(await db.auditoria.count({where:{accion:'REPORTAR_INCONSISTENCIA_TIENDA'}}),3);

  const forbidden=await POST(request('reportar',userB,{...single,solicitudId:randomUUID(),tiendaId:storeA.id}));
  assert.equal(forbidden.status,403);
  const dashboardB=await payload(await GET(request('inicio',userB)));
  assert.equal(dashboardB.body.data.recent.length,0);

  const multiTransfer='78755';
  const firstMulti=await POST(request('reportar',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:multiTransfer,codigoBarra:productA.codigoBarra,motivo:'FALTANTE',submotivo:'NO_ESTA_FISICO',cantidad:1}));
  const secondMulti=await POST(request('reportar',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:multiTransfer,codigoBarra:productB.codigoBarra,motivo:'SOBRANTE',submotivo:'UNIDADES_MAS_PAQUETE',cantidad:2}));
  assert.equal(firstMulti.status,200);assert.equal(secondMulti.status,200);
  const completedWithCases=await payload(await POST(request('finalizar-con-incidencias',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:multiTransfer})));
  assert.equal(completedWithCases.response.status,200);assert.equal(completedWithCases.body.data.reporte.sinIncidencias,false);
  assert.equal(await db.inconsistencia.count({where:{tiendaId:storeB.id,transferencia:multiTransfer}}),2);
  const managedCase=await db.inconsistencia.findFirstOrThrow({where:{tiendaId:storeB.id,transferencia:multiTransfer,codigoBarra:productA.codigoBarra}});
  await db.inconsistencia.update({where:{id:managedCase.id},data:{motivo:'Diferencia confirmada',comentarioAdmin:'Validado por administración'}});
  const afterMulti=await payload(await GET(request('inicio',userB)));
  assert.equal(afterMulti.body.data.transfers.some(item=>item.id===multiTransfer),false);
  const completedReport=afterMulti.body.data.reports.find(item=>item.transferencia===multiTransfer);
  assert.equal(completedReport.detalles.length,2);
  assert.deepEqual(completedReport.detalles.map(item=>item.codigoBarra).sort(),[productA.codigoBarra,productB.codigoBarra]);
  assert.equal(completedReport.detalles.find(item=>item.codigoBarra===productA.codigoBarra).observacionAdmin,'Diferencia confirmada · Validado por administración');

  const mixedTransfer='78756';
  const mixedUnknown=await POST(request('codigo-no-inventario',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:mixedTransfer,codigoBarraNoInventario:'9990000000099',motivo:'OTRO',detalle:'Código recibido fuera del inventario'}));
  assert.equal(mixedUnknown.status,200);
  const pendingMixed=await payload(await GET(request('inicio',userB)));
  const pendingMixedReport=pendingMixed.body.data.reports.find(item=>item.transferencia===mixedTransfer);
  assert.equal(pendingMixedReport.finalizado,false);
  assert.equal(pendingMixedReport.detalles[0].codigoBarra,'9990000000099');
  const mixedKnown=await POST(request('reportar',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:mixedTransfer,codigoBarra:productA.codigoBarra,motivo:'FALTANTE',submotivo:'NO_ESTA_FISICO',cantidad:1}));
  assert.equal(mixedKnown.status,200);
  const mixedComplete=await payload(await POST(request('finalizar-con-incidencias',userB,{solicitudId:randomUUID(),tiendaId:storeB.id,transferencia:mixedTransfer})));
  assert.equal(mixedComplete.response.status,200);
  const mixedReport=await db.reporteTransferenciaTienda.findUniqueOrThrow({where:{tiendaId_transferencia:{tiendaId:storeB.id,transferencia:mixedTransfer}},include:{inconsistencias:true,codigosNoInventario:true}});
  assert.equal(mixedReport.inconsistencias.length,2);
  assert.equal(mixedReport.inconsistencias.some(item=>item.tipoError==='Código no registrado'&&item.codigoBarra==='9990000000099'),true);
  assert.equal(mixedReport.codigosNoInventario.length,1);

  await admin.query(`CREATE FUNCTION reject_store_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='REPORTAR_INCONSISTENCIA_TIENDA' THEN RAISE EXCEPTION 'audit rejected'; END IF; RETURN NEW; END; $$`);
  await admin.query(`CREATE TRIGGER reject_store_audit BEFORE INSERT ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION reject_store_audit()`);
  const beforeCount=await db.inconsistencia.count();
  try{
    const failed=await POST(request('reportar',userA,{...single,solicitudId:randomUUID(),transferencia:'78757'}));
    assert.equal(failed.status,503);assert.equal(await db.inconsistencia.count(),beforeCount);
  }finally{await admin.query(`DROP TRIGGER reject_store_audit ON "Auditoria"`);await admin.query(`DROP FUNCTION reject_store_audit()`);}
});
