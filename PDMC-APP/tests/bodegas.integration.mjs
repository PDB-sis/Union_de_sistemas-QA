import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {ejecutarModulo} from "../backend/src/sync/ejecutar.ts";
import {modulos} from "../backend/src/sync/modulos.ts";
import {TransferQueryService} from "../backend/src/transferencias/consulta.ts";
import {ensureSyncUser} from "../backend/src/sync/usuario-sistema.ts";

// Fase 3b: transferencias, devoluciones y facturadores salen de lo que envían los
// agentes (agente_fila), una carga por bodega; los números se repiten entre bodegas.
nextEnv.loadEnvConfig(process.cwd());
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_bodegas_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const modulo=id=>modulos.find(m=>m.id===id);
const sitios={};
let previo,previoDim,previoEmail;

before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  for(const migration of (await readdir(new URL('../prisma/migrations',import.meta.url),{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
    const sql=await readFile(new URL(`../prisma/migrations/${migration.name}/migration.sql`,import.meta.url),'utf8');
    await admin.query(sql.replaceAll('"public"',`"${schema}"`));
  }
  // La tabla que llena la API de CYSN (migración 006), en el mismo esquema de prueba.
  await admin.query(`CREATE TABLE agente_fila (id BIGSERIAL PRIMARY KEY, dim_id_tienda INTEGER NOT NULL, tarea VARCHAR(30) NOT NULL, clave VARCHAR(400) NOT NULL, datos JSONB NOT NULL, fila_hash CHAR(64) NOT NULL DEFAULT repeat('a',64), activo BOOLEAN NOT NULL DEFAULT TRUE, ultimo_snapshot_id UUID, recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (dim_id_tienda, tarea, clave))`);
  // Y el inventario que envía el agente (migraciones 003 y 005), con lo que lee PDMC.
  await admin.query(`CREATE TABLE inventario_agente_actual (id BIGSERIAL PRIMARY KEY, dim_id_tienda INTEGER, codigo_barra VARCHAR(100) NOT NULL, referencia VARCHAR(180), descripcion TEXT, existencia NUMERIC(18,2), nombre_categoria VARCHAR(180), linea VARCHAR(180), marca VARCHAR(180), activo BOOLEAN NOT NULL DEFAULT TRUE, recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (dim_id_tienda, codigo_barra))`);
  previo=process.env.PDMC_AGENTE_SCHEMA;process.env.PDMC_AGENTE_SCHEMA=schema;
  previoDim=process.env.PDMC_INVENTARIO_DIM_ID;process.env.PDMC_INVENTARIO_DIM_ID="2004";
  previoEmail=process.env.PDMC_SYNC_USUARIO_EMAIL;process.env.PDMC_SYNC_USUARIO_EMAIL="sync-bodegas@example.test";
  const region=randomUUID();
  await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo) VALUES ($1,'REG-B','Región bodegas','REGION')`,[region]);
  for(const [dim,codigo,nombre] of [[2004,'999997','BODEGA MARACAIBO'],[2005,'999998','BODEGA MATEO']]){
    const id=randomUUID();sitios[dim]=id;
    await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo,"regionId","dimIdTienda") VALUES ($1,$2,$3,'BODEGA',$4,$5)`,[id,codigo,nombre,region,dim]);
  }
  const tienda=randomUUID();
  await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo,"regionId") VALUES ($1,'1010103','SUC. GALERIAS','TIENDA',$2)`,[tienda,region]);
});

after(async()=>{
  for(const [k,v] of [["PDMC_AGENTE_SCHEMA",previo],["PDMC_INVENTARIO_DIM_ID",previoDim],["PDMC_SYNC_USUARIO_EMAIL",previoEmail]])if(v===undefined)delete process.env[k];else process.env[k]=v;
  await db.$disconnect();
  if(!/^pdmc_bodegas_[a-f0-9]{32}$/.test(schema))throw new Error('Esquema de prueba inválido.');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});

const linea=(numero,codigo,caja,cantidad,estado="Abierta")=>({Numero:numero,fecha_formateada:"10/20/2026",CodNombre:"F1",CodigoBarra:codigo,Cantidad:String(cantidad),NumeroCaja:caja,codigoRecibe_Dletra:"1010103",status:estado,observacion:"OK"});
async function enviar(dim,tarea,clave,datos,activo=true){
  await admin.query(`INSERT INTO agente_fila (dim_id_tienda,tarea,clave,datos,activo,recibido_at) VALUES ($1,$2,$3,$4,$5,clock_timestamp()) ON CONFLICT (dim_id_tienda,tarea,clave) DO UPDATE SET datos=EXCLUDED.datos,activo=EXCLUDED.activo,recibido_at=clock_timestamp()`,[dim,tarea,clave,JSON.stringify(datos),activo]);
}
const transferencias=async numero=>(await db.transferenciaConsulta.findMany({where:{numero},include:{detalles:true,origen:true},orderBy:{origenId:"asc"}}));

test("sin datos de ningún agente no es un fallo",async()=>{
  for(const id of ["TRANSFERENCIAS","DEVOLUCIONES","INVENTARIO"]){
    const r=await ejecutarModulo(db,modulo(id));
    assert.equal(r.estado,"SIN_CAMBIOS",id);assert.equal(r.totalFilas,0);assert.match(r.resumen.aviso,/todavía/);
  }
  await admin.query(`DELETE FROM "SincronizacionEstado"`);
});

test("facturadores llegan del agente",async()=>{
  await enviar(2004,"usuarios","F1",{CodUsuario:"F1",NombreUsuario:"ANA"});
  const r=await ejecutarModulo(db,modulo("FACTURADORES"));
  assert.equal(r.estado,"EXITOSA");assert.equal((await db.perfilLaboral.findUniqueOrThrow({where:{codigo:"F1"}})).nombre,"ANA");
});

test("el mismo número en dos bodegas son dos transferencias distintas",async()=>{
  await enviar(2004,"transferencias","T1|A|1",linea("T1","A","1",5));
  await enviar(2004,"transferencias","T1|B|2",linea("T1","B","2",3));
  await enviar(2005,"transferencias","T1|Z|1",linea("T1","Z","1",9,"Exportada"));
  const r=await ejecutarModulo(db,modulo("TRANSFERENCIAS"));
  assert.equal(r.estado,"EXITOSA");assert.equal(r.totalFilas,3);
  assert.deepEqual(r.resumen.sitios.map(s=>[s.dimIdTienda,s.filas]),[[2004,2],[2005,1]]);
  const t=await transferencias("T1");
  assert.equal(t.length,2);
  const maracaibo=t.find(x=>x.origenId===sitios[2004]),mateo=t.find(x=>x.origenId===sitios[2005]);
  assert.equal(maracaibo.unidades,8);assert.equal(maracaibo.detalles.length,2);assert.equal(maracaibo.estado,"Abierta");
  assert.equal(mateo.unidades,9);assert.equal(mateo.estado,"Exportada");
  // Enlace con la tienda y el facturador, igual que con SQL Server.
  assert.ok(maracaibo.tiendaId);assert.ok(maracaibo.facturadorId);
});

test("si nada cambió en agente_fila no se relee ni se reimporta",async()=>{
  const r=await ejecutarModulo(db,modulo("TRANSFERENCIAS"));
  assert.equal(r.estado,"SIN_CAMBIOS");assert.equal(r.totalFilas,3);
});

test("una baja en una bodega no toca la otra",async()=>{
  await enviar(2005,"transferencias","T1|Z|1",linea("T1","Z","1",9,"Exportada"),false);
  await enviar(2005,"transferencias","T2|Z|1",linea("T2","Z","1",1));
  await enviar(2004,"transferencias","T1|B|2",linea("T1","B","2",4));
  const r=await ejecutarModulo(db,modulo("TRANSFERENCIAS"));
  assert.equal(r.estado,"EXITOSA");
  const t=await transferencias("T1"),maracaibo=t.find(x=>x.origenId===sitios[2004]),mateo=t.find(x=>x.origenId===sitios[2005]);
  assert.equal(maracaibo.bajaEn,null);assert.equal(maracaibo.unidades,9);
  assert.notEqual(mateo.bajaEn,null);
  assert.equal((await transferencias("T2"))[0].origenId,sitios[2005]);
});

test("el detalle por número prefiere la transferencia vigente",async()=>{
  const detalle=await new TransferQueryService(db).detail("T1");
  assert.equal(detalle.unidades,9);assert.equal(detalle.items.length,2);
});

test("devoluciones por bodega",async()=>{
  const d=(estado,valor)=>({Numero:"D1",fecha_formateada:"10/20/2026",CodNombre:"F1",usuario:"ANA",codigoRecibe_Dletra:"1010103",status:estado,Observacion:"",TotalValor:valor,DocumentoOrigen:"55"});
  await enviar(2004,"devoluciones","D1",d("Abierta","10.5"));
  await enviar(2005,"devoluciones","D1",d("Exportada","20"));
  const r=await ejecutarModulo(db,modulo("DEVOLUCIONES"));
  assert.equal(r.estado,"EXITOSA");
  const filas=await db.devolucionConsulta.findMany({where:{numero:"D1"},orderBy:{estado:"asc"}});
  assert.deepEqual(filas.map(f=>[f.origenId,f.estado,f.totalValor.toString()]),[[sitios[2004],"Abierta","10.5"],[sitios[2005],"Exportada","20"]]);
});

test("un sitio que no está en el catálogo detiene la carga con un mensaje claro",async()=>{
  await enviar(9999,"devoluciones","D9",{Numero:"D9"});
  const r=await ejecutarModulo(db,modulo("DEVOLUCIONES"));
  assert.equal(r.estado,"FALLIDA");assert.match(r.error,/dimID_Tienda 9999.*no está en el catálogo/);
  await admin.query(`DELETE FROM agente_fila WHERE dim_id_tienda=9999`);
});

test("el número sigue siendo único dentro de cada bodega y entre los que no tienen bodega",async()=>{
  const base=await db.transferenciaConsulta.findFirstOrThrow({where:{numero:"T2"}});
  const copia={fecha:base.fecha,codigoFacturador:"F1",codigoTiendaConsulta:"X",estado:"Abierta",unidades:1,cantidadCodigos:1,ultimaImportacionId:base.ultimaImportacionId};
  await assert.rejects(db.transferenciaConsulta.create({data:{...copia,numero:"T2",origenId:sitios[2005]}}),{code:"P2002"});
  await db.transferenciaConsulta.create({data:{...copia,numero:"SIN-ORIGEN"}});
  await assert.rejects(db.transferenciaConsulta.create({data:{...copia,numero:"SIN-ORIGEN"}}),{code:"P2002"});
});

async function producto(dim,codigo,existencia,{categoria="DAMA",linea="PANTYS",activo=true}={}){
  await admin.query(`INSERT INTO inventario_agente_actual (dim_id_tienda,codigo_barra,referencia,descripcion,existencia,nombre_categoria,linea,marca,activo,recibido_at) VALUES ($1,$2,'REF','Producto',$3,$4,$5,'MARCA',$6,clock_timestamp()) ON CONFLICT (dim_id_tienda,codigo_barra) DO UPDATE SET existencia=EXCLUDED.existencia,activo=EXCLUDED.activo,recibido_at=clock_timestamp()`,[dim,codigo,existencia,categoria,linea,activo]);
}

test("inventario: sale del agente del sitio configurado, solo activos con categoría",async()=>{
  await ensureSyncUser(db,process.env.PDMC_SYNC_USUARIO_EMAIL);
  await producto(2004,"INV-A",-3);await producto(2004,"INV-B",5);
  await producto(2004,"INV-C",-2,{activo:false});            // inactivo: no entra (decisión revisable del 2026-10-26)
  await producto(2004,"INV-D",-1,{categoria:null});          // sin categoría: como la consulta anterior
  await producto(2005,"INV-OTRA",-9);                        // otro sitio: no se mezcla
  // Como con SQL Server, la primera carga debe publicar la fotografía de negativos.
  const sinFoto=await ejecutarModulo(db,modulo("INVENTARIO"));
  assert.equal(sinFoto.estado,"FALLIDA");assert.match(sinFoto.error,/primera carga debe publicar/i);
  const r=await ejecutarModulo(db,modulo("INVENTARIO"),{publicarNegativos:true});
  assert.equal(r.estado,"EXITOSA");assert.equal(r.totalFilas,2);
  const codigos=(await db.inventarioActual.findMany({include:{producto:true}})).map(i=>i.producto.codigoBarra).sort();
  assert.deepEqual(codigos,["INV-A","INV-B"]);
  const foto=await db.fotoNegativos.findFirstOrThrow({include:{items:{include:{producto:true}}}});
  assert.deepEqual(foto.items.map(i=>i.producto.codigoBarra),["INV-A"]);
});

test("inventario: sin cambios en el agente no se reimporta; con cambios, sí",async()=>{
  assert.equal((await ejecutarModulo(db,modulo("INVENTARIO"))).estado,"SIN_CAMBIOS");
  await producto(2004,"INV-B",7);
  const r=await ejecutarModulo(db,modulo("INVENTARIO"));
  assert.equal(r.estado,"EXITOSA");
  const b=await db.inventarioActual.findFirstOrThrow({where:{producto:{codigoBarra:"INV-B"}}});
  assert.equal(b.existencia.toString(),"7");
});
