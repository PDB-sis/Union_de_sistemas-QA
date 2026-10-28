import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Valida la migración de retiro sobre el esquema histórico en una base en memoria.
const db = new PGlite();
const bodega = randomUUID();
const producto = randomUUID();
const negativo = randomUUID();

before(async () => {
  const base = await readFile(new URL("../../backend/prisma/migrations/202609080001_base_negativos/migration.sql", import.meta.url), "utf8");
  const cleanup = await readFile(new URL("../../backend/prisma/migrations/202609230002_limpiar_consultas_negativos_legacy/migration.sql", import.meta.url), "utf8");
  await db.exec(base);
  await db.exec(cleanup);
  await db.query('INSERT INTO "Bodega" (id,codigo,nombre,"updatedAt") VALUES ($1,\'TEST-A\',\'Solo prueba\',now())', [bodega]);
  await db.query('INSERT INTO "Producto" (id,"codigoBarra","updatedAt") VALUES ($1,\'0000123\',now())', [producto]);
  await db.query('INSERT INTO "Negativo" (id,"productoId","bodegaId","primeraDeteccion","ultimaDeteccion","updatedAt") VALUES ($1,$2,$3,now(),now(),now())', [negativo, producto, bodega]);
});
after(() => db.close());

test("la limpieza retira únicamente las tablas y tipos heredados", async () => {
  const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  const names = new Set(tables.rows.map(row => row.table_name));
  for (const removed of ["ConsultaNegativos","DetalleConsultaNegativos","MigracionLocalNegativos","UnificacionNegativos"]) assert.equal(names.has(removed), false);
  for (const active of ["Producto","Bodega","Negativo","HistorialNegativo","Auditoria"]) assert.equal(names.has(active), true);
  const types = await db.query("SELECT typname FROM pg_type WHERE typname IN ('OrigenConsulta','EstadoConsulta')");
  assert.equal(types.rows.length, 0);
});

test("los expedientes y su historial operativo siguen íntegros", async () => {
  const product = await db.query('SELECT "codigoBarra" FROM "Producto" WHERE id=$1', [producto]);
  assert.equal(product.rows[0].codigoBarra, "0000123");
  await db.query('INSERT INTO "HistorialNegativo" (id,"negativoId",accion,motivo,"valorNuevo") VALUES ($1,$2,\'PRUEBA\',\'Dato sintético\',\'{}\')', [randomUUID(), negativo]);
  await assert.rejects(db.query('DELETE FROM "Negativo" WHERE id=$1', [negativo]), { code: "23503" });
});

test("la migración deja una auditoría recuperable de la decisión", async () => {
  const event = await db.query("SELECT accion,\"valorAnterior\",\"valorNuevo\" FROM \"Auditoria\" WHERE accion='RETIRAR_FLUJO_NEGATIVOS_LEGACY'");
  assert.equal(event.rows.length, 1);
  assert.deepEqual(event.rows[0].valorNuevo, {fuente:"ConsultaInventario/InventarioActual",expedientes:"Negativo",historial:"HistorialNegativo"});
});
