import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import { loadEnv } from "../src/env.ts";
import pg from "pg";

// La migración 20261026120000_origen_bodega sobre datos ya importados, como los del
// servidor: lo existente pasa a la bodega MARACAIBO (dimID 2004) sin perder nada.
loadEnv();
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString||(!process.env.TEST_DATABASE_URL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)))throw new Error("Use una base local o TEST_DATABASE_URL explícita.");
const schema=`pdmc_migorigen_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Client({connectionString});
const MIGRACION="20261026120000_origen_bodega";
const bodega=randomUUID();

async function aplicar(nombres){for(const nombre of nombres)await admin.query((await readFile(new URL(`../../backend/prisma/migrations/${nombre}/migration.sql`,import.meta.url),'utf8')).replaceAll('"public"',`"${schema}"`));}

before(async()=>{
  await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`SET search_path TO "${schema}"`);
  const todas=(await readdir(new URL('../../backend/prisma/migrations',import.meta.url),{withFileTypes:true})).filter(i=>i.isDirectory()).map(i=>i.name).sort();
  await aplicar(todas.filter(n=>n<MIGRACION));
  // Estado del servidor antes de la migración: catálogo con la bodega 2004 y datos sin bodega.
  const region=randomUUID(),imp=randomUUID(),dev=randomUUID();
  await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo) VALUES ($1,'R','Región','REGION')`,[region]);
  await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo,"regionId","dimIdTienda") VALUES ($1,'999997','BODEGA MARACAIBO','BODEGA',$2,2004)`,[bodega,region]);
  await admin.query(`INSERT INTO "TransferenciaConsultaImport" (id,"nombreArchivo","hashArchivo","totalFilas",resumen) VALUES ($1,'x','h',1,'{}')`,[imp]);
  for(const n of ['80001','80002'])await admin.query(`INSERT INTO "TransferenciaConsulta" (id,numero,fecha,"codigoFacturador","codigoTiendaConsulta",estado,unidades,"cantidadCodigos","ultimaImportacionId","updatedAt") VALUES ($1,$2,'2026-08-14','F','T','Abierta',1,1,$3,now())`,[randomUUID(),n,imp]);
  await admin.query(`INSERT INTO "DevolucionConsultaImport" (id,"nombreArchivo","hashArchivo","totalFilas",resumen) VALUES ($1,'x','h',1,'{}')`,[dev]);
  await admin.query(`INSERT INTO "DevolucionConsulta" (id,numero,fecha,"codigoResponsable","codigoTiendaConsulta",estado,observacion,"ultimaImportacionId","updatedAt") VALUES ($1,'5000','2026-08-14','F','T','Abierta','',$2,now())`,[randomUUID(),dev]);
  await aplicar([MIGRACION]);
});

after(async()=>{
  if(!/^pdmc_migorigen_[a-f0-9]{32}$/.test(schema))throw new Error('Esquema de prueba inválido.');
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
});

test("lo importado antes queda asignado a la bodega 2004, sin perder filas",async()=>{
  const t=await admin.query(`SELECT numero,"origenId" FROM "TransferenciaConsulta" ORDER BY numero`);
  assert.deepEqual(t.rows.map(r=>[r.numero,r.origenId]),[['80001',bodega],['80002',bodega]]);
  const d=await admin.query(`SELECT "origenId" FROM "DevolucionConsulta"`);
  assert.equal(d.rows[0].origenId,bodega);
});

test("el mismo número se admite en otra bodega y se rechaza en la misma",async()=>{
  const otra=randomUUID(),imp=(await admin.query(`SELECT id FROM "TransferenciaConsultaImport" LIMIT 1`)).rows[0].id;
  await admin.query(`INSERT INTO "Ubicacion" (id,codigo,nombre,tipo,"regionId","dimIdTienda") SELECT $1,'999998','BODEGA MATEO','BODEGA',"regionId",2005 FROM "Ubicacion" WHERE id=$2`,[otra,bodega]);
  const insertar=origen=>admin.query(`INSERT INTO "TransferenciaConsulta" (id,numero,fecha,"codigoFacturador","codigoTiendaConsulta",estado,unidades,"cantidadCodigos","ultimaImportacionId","updatedAt","origenId") VALUES ($1,'80001','2026-10-26','F','T','Abierta',1,1,$2,now(),$3)`,[randomUUID(),imp,origen]);
  await insertar(otra);
  await assert.rejects(insertar(bodega),{code:'23505'});
});
