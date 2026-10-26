import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { assertReadOnlyQuery } from "../backend/src/sync/solo-lectura.ts";

test("las consultas de consultaPDMC se aceptan como solo lectura", () => {
  const files = readdirSync(new URL("../sqlserver/consultas/", import.meta.url));
  assert.deepEqual([...files].sort(), ["devoluciones.sql", "facturadores.sql", "inventario.sql", "sucursales.sql", "transferencias.sql"]);
  for (const file of files) {
    assert.doesNotThrow(() => assertReadOnlyQuery(readFileSync(new URL("../sqlserver/consultas/" + file, import.meta.url), "utf8")), file);
  }
});

test("rechaza cualquier consulta que escriba o ejecute codigo en SQL Server", () => {
  for (const query of [
    "UPDATE dbo.INVENTARIO SET Existencia = 0",
    "SELECT * FROM dbo.SUCURSALES; DELETE FROM dbo.SUCURSALES",
    "SELECT * INTO dbo.copia FROM dbo.SUCURSALES",
    "SELECT 1; EXEC xp_cmdshell 'dir'",
    "WITH x AS (SELECT 1 AS a) MERGE dbo.T USING x ON 1=0 WHEN NOT MATCHED THEN INSERT (a) VALUES (1);",
    "DROP TABLE dbo.SUCURSALES",
  ]) assert.throws(() => assertReadOnlyQuery(query), /solo se lee|una sola instruccion/, query);
});

test("ignora palabras dentro de comentarios, textos e identificadores", () => {
  assert.doesNotThrow(() => assertReadOnlyQuery("-- no hacer UPDATE\nSELECT 'DELETE' AS texto, [Update] FROM dbo.T;"));
});
