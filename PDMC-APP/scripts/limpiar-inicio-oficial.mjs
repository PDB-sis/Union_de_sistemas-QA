import nextEnv from "@next/env";
import pg from "pg";
import {spawn} from "node:child_process";
import {createWriteStream,existsSync,mkdirSync,statSync,unlinkSync} from "node:fs";
import {resolve} from "node:path";

nextEnv.loadEnvConfig(process.cwd());

const confirmation="INICIAR-OPERACION-OFICIAL";
const args=new Set(process.argv.slice(2));
const execute=args.has("--execute");
const validateTransaction=args.has("--validar-transaccion");
const supplied=process.argv.slice(2).find(value=>value.startsWith("--confirmar="))?.slice("--confirmar=".length);
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("Falta DATABASE_URL.");

// Orden de dependencias: solo datos operativos y de acceso. Los catálogos
// Ubicacion, Tienda, Bodega, BodegaProducto, LineaInventario, Producto y
// PerfilLaboral permanecen intactos.
const tables=[
  "Auditoria","HistorialNegativo",
  "TransferenciaConsulta","TransferenciaConsultaImport",
  "ReporteTransferenciaTienda","InconsistenciaCodigoNoInventario","Inconsistencia",
  "Negativo","InventarioActual","ConsultaInventario",
  "SesionUsuario","IntentoAcceso","VinculoOperativo","AsignacionAcceso","Usuario",
];
const preserved=["Ubicacion","Tienda","Bodega","BodegaProducto","LineaInventario","ExcepcionBodegaProducto","Producto","PerfilLaboral"];
const quote=name=>`"${name}"`;

async function backup(url){
  const parsed=new URL(url),local=["localhost","127.0.0.1","[::1]"].includes(parsed.hostname)&&parsed.port==="55432"&&parsed.pathname==="/pdmc";
  const directory=resolve("backups");mkdirSync(directory,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const output=resolve(directory,`pdmc-antes-inicio-oficial-${stamp}.dump`);
  const command=local?"docker":"pg_dump";
  const commandArgs=local?["compose","exec","-T","postgres","pg_dump","-U","pdmc_owner","-d","pdmc","--format=custom","--no-owner"]:["--host",parsed.hostname,"--port",parsed.port||"5432","--username",decodeURIComponent(parsed.username),"--dbname",parsed.pathname.slice(1),"--format=custom","--no-owner"];
  await new Promise((resolvePromise,reject)=>{
    const file=createWriteStream(output,{flags:"wx"}),child=spawn(command,commandArgs,{stdio:["ignore","pipe","pipe"],windowsHide:true,env:{...process.env,PGPASSWORD:decodeURIComponent(parsed.password)}});let error="";
    child.stderr.on("data",chunk=>{if(error.length<4000)error+=chunk.toString()});child.stdout.pipe(file);
    child.on("error",reject);child.on("close",code=>file.end(()=>code===0?resolvePromise():reject(new Error(error||"No se pudo crear el respaldo."))));
  }).catch(error=>{if(existsSync(output))unlinkSync(output);throw error});
  if(!existsSync(output)||statSync(output).size<5)throw new Error("El respaldo quedó vacío; se canceló la limpieza.");
  return output;
}

async function counts(client,names){
  const result={};for(const name of names)result[name]=Number((await client.query(`SELECT COUNT(*)::bigint AS count FROM ${quote(name)}`)).rows[0].count);return result;
}
const total=values=>Object.values(values).reduce((sum,value)=>sum+value,0);
const print=(title,values)=>{console.info(title);for(const [name,value] of Object.entries(values))console.info(`  ${name}: ${value}`);console.info(`  TOTAL: ${total(values)}`)};

const client=new pg.Client({connectionString});
try{
  await client.connect();
  const before=await counts(client,tables),kept=await counts(client,preserved);
  print("Registros que se eliminarían:",before);print("Catálogos que se conservarán:",kept);
  if(!execute&&!validateTransaction){
    console.info("Simulación finalizada. No se modificó la base de datos.");
    console.info(`Para ejecutar: npm run db:limpiar-inicio -- --execute --confirmar=${confirmation}`);
    process.exitCode=0;
  }else{
    if(execute&&supplied!==confirmation)throw new Error(`Confirmación inválida. Debe usar --confirmar=${confirmation}`);
    if(total(before)===0)throw new Error("No hay datos operativos que limpiar.");
    const backupPath=execute?await backup(connectionString):null;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try{
      await client.query("SELECT pg_advisory_xact_lock(19012026)");
      await client.query('ALTER TABLE "Auditoria" DISABLE TRIGGER "Auditoria_inmutable"');
      for(const name of tables)await client.query(`DELETE FROM ${quote(name)}`);
      await client.query('ALTER TABLE "Auditoria" ENABLE TRIGGER "Auditoria_inmutable"');
      const after=await counts(client,tables);
      if(total(after)!==0)throw new Error("La verificación posterior detectó registros restantes.");
      if(validateTransaction){
        await client.query("ROLLBACK");
        const restored=await counts(client,tables);
        if(Object.keys(before).some(name=>before[name]!==restored[name]))throw new Error("El rollback de validación no restauró los conteos originales.");
        console.info("Transacción validada y revertida. No se modificó la base de datos.");
      }else{
        await client.query("COMMIT");
        console.info(`Limpieza completada. Respaldo recuperable: ${backupPath}`);
        console.info("Siguiente paso obligatorio: configurar las cuentas oficiales y ejecutar npm run crear-usuarios-iniciales.");
      }
    }catch(error){await client.query("ROLLBACK");throw error}
  }
}catch(error){
  console.error(error instanceof Error?error.message:"No se pudo preparar la limpieza.");process.exitCode=1;
}finally{await client.end()}
