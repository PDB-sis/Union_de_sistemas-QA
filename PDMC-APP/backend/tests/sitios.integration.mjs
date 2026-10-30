import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import { loadEnv } from "../src/env.ts";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../generated/prisma/client.ts";
import {importStoreCatalog,REGION_PENDIENTE} from "../src/tienda/catalogo.ts";

loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_sitios_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString});
const db=new PrismaClient({adapter:new PrismaPg({connectionString,options:`-c search_path=${schema}`,max:5},{schema})});
const ORIGEN="prueba sitios";

const csv=rows=>['"dimID_Tienda","Codigo","Nombre","Descripcion","Zona","Status","Tipo","ModoOp"',...rows.map(r=>r.map(v=>`"${v}"`).join(','))].join('\r\n')+'\r\n';
const GALERIAS=['1028','1010103','SUC. GALERIAS','','1','1','1','0'];
const VALENCIA=['2003','999999','BODEGA VALENCIA','','0','1','0','0'];
const PITIRU=['1','210101','SUC. PITIRU','','2','1','1','0'];
const COQUETA=['1035','210101','SUC. COQUETA UNO','','2','1','1','0'];
const MATEO=['2005','999998','BODEGA MATEO','','0','1','0','0'];

before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  for(const migration of (await readdir(new URL('../../backend/prisma/migrations',import.meta.url),{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
    const sql=await readFile(new URL(`../../backend/prisma/migrations/${migration.name}/migration.sql`,import.meta.url),'utf8');
    await admin.query(sql.replaceAll('"public"',`"${schema}"`));
  }
  // Tiendas históricas sin región, como las 32 actuales (la regla de región es NOT VALID).
  await admin.query('ALTER TABLE "Ubicacion" DROP CONSTRAINT "Ubicacion_region_obligatoria_check"');
  for(const [codigo,nombre] of [['1010103','C.C. GALERIAS MALL (NORALIS)'],['999999','VALENCIA CASA MATRIZ'],['17738127','CLIENTE JOSE LUIS PAREDES']]){
    const id=randomUUID();
    await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo) VALUES ($1,$2,$3,'TIENDA')`,[id,codigo,nombre]);
    await admin.query(`INSERT INTO "Tienda" (id,codigo,nombre,"ubicacionId","updatedAt") VALUES ($1,$2,$3,$4,now())`,[randomUUID(),codigo,nombre,id]);
  }
  await admin.query(`ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_region_obligatoria_check" CHECK ((tipo = 'REGION' AND "regionId" IS NULL) OR (tipo IN ('TIENDA', 'BODEGA') AND "regionId" IS NOT NULL)) NOT VALID`);
});

after(async()=>{
  await db.$disconnect();
  if(!/^pdmc_sitios_[a-f0-9]{32}$/.test(schema))throw new Error('Esquema de prueba inválido.');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});

const sitio=codigo=>db.ubicacion.findUnique({where:{codigo},include:{tienda:true,bodega:true,region:true}});

test("primera carga: enlaza por código, crea los nuevos y deja pendientes los dudosos",async()=>{
  const r=await importStoreCatalog(db,csv([GALERIAS,VALENCIA,PITIRU,COQUETA,MATEO]),ORIGEN);
  assert.deepEqual({total:r.total,creados:r.creados,enlazados:r.enlazados,actualizados:r.actualizados,desactivados:r.desactivados},{total:5,creados:3,enlazados:1,actualizados:0,desactivados:0});

  // La tienda histórica conserva su código (las transferencias la buscan por él) y recibe dimID y región.
  const galerias=await sitio('1010103');
  assert.equal(galerias.dimIdTienda,1028);assert.equal(galerias.codigoCorporativo,'1010103');
  assert.equal(galerias.nombre,'SUC. GALERIAS');assert.equal(galerias.tienda.nombre,'SUC. GALERIAS');
  assert.equal(galerias.region.codigo,REGION_PENDIENTE.codigo);

  // Código repetido en tbDimTiendas: cada sitio recibe un código PDMC propio.
  const pitiru=await sitio('210101-1'),coqueta=await sitio('210101-1035');
  assert.equal(pitiru.dimIdTienda,1);assert.equal(coqueta.dimIdTienda,1035);
  assert.equal(pitiru.codigoCorporativo,'210101');assert.equal(pitiru.tienda.activa,true);

  // Bodega nueva: Ubicacion BODEGA con su Bodega.
  const mateo=await sitio('999998');
  assert.equal(mateo.tipo,'BODEGA');assert.equal(mateo.bodega.nombre,'BODEGA MATEO');assert.equal(mateo.tienda,null);

  // VALENCIA existe como TIENDA y es BODEGA: no se toca, queda para revisión.
  assert.equal(r.pendientes.length,1);assert.equal(r.pendientes[0].dimIdTienda,2003);
  assert.match(r.pendientes[0].motivo,/TIENDA.*BODEGA/);
  const valencia=await sitio('999999');
  assert.equal(valencia.dimIdTienda,null);assert.equal(valencia.nombre,'VALENCIA CASA MATRIZ');

  // Los destinos que no están en el catálogo (clientes) no se tocan.
  const cliente=await sitio('17738127');
  assert.equal(cliente.dimIdTienda,null);assert.equal(cliente.tienda.activa,true);

  const eventos=await db.auditoria.groupBy({by:['accion'],_count:true,where:{origen:ORIGEN}});
  assert.deepEqual(Object.fromEntries(eventos.map(e=>[e.accion,e._count])),{SITIO_CREADO:3,SITIO_ENLAZADO:1});
});

test("la misma carga otra vez no cambia nada",async()=>{
  const r=await importStoreCatalog(db,csv([GALERIAS,VALENCIA,PITIRU,COQUETA,MATEO]),ORIGEN);
  assert.deepEqual([r.creados,r.enlazados,r.actualizados,r.desactivados,r.pendientes.length],[0,0,0,0,1]);
});

test("un cambio de nombre se actualiza por dimID",async()=>{
  const r=await importStoreCatalog(db,csv([['1028','1010103','SUC. GALERIAS MALL','','1','1','1','0'],VALENCIA,PITIRU,COQUETA,MATEO]),ORIGEN);
  assert.equal(r.actualizados,1);
  assert.equal((await sitio('1010103')).tienda.nombre,'SUC. GALERIAS MALL');
});

test("un sitio que deja de llegar se desactiva y vuelve a activarse si reaparece",async()=>{
  let r=await importStoreCatalog(db,csv([GALERIAS,VALENCIA,PITIRU,MATEO]),ORIGEN);
  assert.equal(r.desactivados,1);
  assert.equal((await sitio('210101-1035')).tienda.activa,false);
  r=await importStoreCatalog(db,csv([GALERIAS,VALENCIA,PITIRU,COQUETA,MATEO]),ORIGEN);
  assert.equal(r.actualizados,1);
  assert.equal((await sitio('210101-1035')).tienda.activa,true);
});

test("una consulta vacía o con dimID repetido se rechaza sin tocar el catálogo",async()=>{
  await assert.rejects(importStoreCatalog(db,csv([]),ORIGEN),{code:'SIN_FILAS'});
  await assert.rejects(importStoreCatalog(db,csv([GALERIAS,GALERIAS]),ORIGEN),{code:'DUPLICADO'});
  await assert.rejects(importStoreCatalog(db,csv([['1028','1010103','SUC. GALERIAS','','1','1','7','0']]),ORIGEN),/Tipo inválido/);
  assert.equal((await sitio('210101-1035')).tienda.activa,true);
});
