import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {candidates} from "../src/admin/reset-backup.ts";

// En el servidor Windows, PostgreSQL está en C:\Program Files\PostgreSQL\<versión>\bin y no en el PATH:
// el respaldo del restablecimiento debe encontrarlo solo, empezando por la versión más reciente.
test("en Windows busca pg_dump en la instalación de PostgreSQL, la versión más reciente primero",async()=>{
  const base=await mkdtemp(join(tmpdir(),"pdmc-pg-")),previo=process.env.ProgramFiles;
  try{
    for(const version of ["9.6","18","16","no-es-version"])await mkdir(join(base,"PostgreSQL",version,"bin"),{recursive:true});
    process.env.ProgramFiles=base;
    const rutas=(await candidates("win32")).map(c=>c.dump);
    assert.equal(rutas[0],process.env.PDMC_PG_DUMP_PATH||"pg_dump");
    assert.deepEqual(rutas.slice(1),["18","16","9.6"].map(v=>join(base,"PostgreSQL",v,"bin","pg_dump.exe")));
    assert.equal((await candidates("linux")).length,1);
  }finally{
    if(previo===undefined)delete process.env.ProgramFiles;else process.env.ProgramFiles=previo;
    await rm(base,{recursive:true,force:true});
  }
});
