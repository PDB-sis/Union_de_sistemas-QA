import {spawn} from "node:child_process";
import {createWriteStream,createReadStream} from "node:fs";
import {mkdir,stat,unlink,open,writeFile} from "node:fs/promises";
import type {Writable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {NegativosError} from "../negativos/validation";

export type ResetBackup={nombre:string;sha256:string;bytes:number};
type Command={bin:string;prefix:string[]};
function run(command:Command,args:string[],env:NodeJS.ProcessEnv,output?:Writable){
  return new Promise<number>((done,reject)=>{
    const child=spawn(command.bin,[...command.prefix,...args],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let size=0;child.stdout.on("data",b=>{size+=b.length});child.stderr.resume();
    const stream=output?pipeline(child.stdout,output):Promise.resolve();
    if(!output)child.stdout.resume();
    const timer=setTimeout(()=>{child.kill();reject(new Error("BACKUP_TIMEOUT"))},300_000);
    child.on("error",error=>{clearTimeout(timer);reject(error)});
    child.on("close",code=>{clearTimeout(timer);void stream.then(()=>code===0?done(size):reject(new Error("BACKUP_FAILED")),reject)});
    void stream.catch(()=>{child.kill()});
  });
}
async function capture(bin:string,args:string[]){
  return new Promise<string>((done,reject)=>{const child=spawn(bin,args,{windowsHide:true,stdio:["ignore","pipe","ignore"]});let result="";const timer=setTimeout(()=>{child.kill();reject(new Error("DOCKER_TIMEOUT"))},15000);child.stdout.on("data",b=>{result+=b.toString();if(result.length>100000)child.kill()});child.on("error",e=>{clearTimeout(timer);reject(e)});child.on("close",code=>{clearTimeout(timer);if(code===0)done(result);else reject(new Error("DOCKER_FAILED"))})});
}
async function commands(url:URL):Promise<{dump:Command;restore:Command;host:string;port:string}>{
  const dump={bin:process.env.PDMC_PG_DUMP_PATH||"pg_dump",prefix:[]};
  const restore={bin:process.env.PDMC_PG_RESTORE_PATH||"pg_restore",prefix:[]};
  try{await capture(dump.bin,["--version"]);await capture(restore.bin,["--version"]);return {dump,restore,host:url.hostname,port:url.port||"5432"}}catch{}
  if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw new Error("POSTGRES_TOOLS_REQUIRED");
  const port=url.port||"5432",ids=(await capture("docker",["ps","--filter",`publish=${port}`,"--format","{{.ID}}"])).trim().split(/\s+/).filter(Boolean);
  const matches:{id:string;port:string}[]=[];
  for(const id of ids){if(!/^[a-f0-9]+$/.test(id))continue;const ports=JSON.parse(await capture("docker",["inspect","--format","{{json .NetworkSettings.Ports}}",id])) as Record<string,{HostPort:string}[]|null>;for(const [inside,mappings] of Object.entries(ports))if(mappings?.some(m=>m.HostPort===port)&&/^\d+\/tcp$/.test(inside))matches.push({id,port:inside.split("/")[0]});}
  if(matches.length!==1)throw new Error("BACKUP_CONTAINER_NOT_UNIQUE");
  const target=matches[0];return {dump:{bin:"docker",prefix:["exec","--env","PGPASSWORD",target.id,"pg_dump"]},restore:{bin:"docker",prefix:["exec",target.id,"pg_restore"]},host:"127.0.0.1",port:target.port};
}
export async function createResetBackup(schema:string):Promise<ResetBackup>{
  let file:string|undefined;
  try{
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new Error("SCHEMA");
    const url=new URL(process.env.DATABASE_URL!),tools=await commands(url),directory=resolve(dirname(fileURLToPath(import.meta.url)),"../../backups/restablecimientos");await mkdir(directory,{recursive:true,mode:0o700});
    const nombre=`pdmc-${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID()}.dump`;file=resolve(directory,nombre);
    const env={...process.env,PGPASSWORD:decodeURIComponent(url.password)};
    const args=["--host",tools.host,"--port",tools.port,"--username",decodeURIComponent(url.username),"--dbname",decodeURIComponent(url.pathname.slice(1)),"--schema",schema,"--format=custom","--no-owner","--no-acl"];
    // Los respaldos se crean en ejecución; nunca deben incluirse en el build.
    const bytes=await run(tools.dump,args,env,createWriteStream(file,{flags:"wx",mode:0o600}));
    if(bytes<100||(await stat(/* turbopackIgnore: true */ file)).size!==bytes)throw new Error("EMPTY_BACKUP");
    const handle=await open(/* turbopackIgnore: true */ file,"r+");try{await handle.sync()}finally{await handle.close()}
    // Docker no ve el disco del servidor: se verifica el archivo a través de stdin.
    const verify=tools.restore.bin==="docker"?{...tools.restore,prefix:["exec","-i",...tools.restore.prefix.slice(1)]}:tools.restore;
    await new Promise<void>((done,reject)=>{
      const child=spawn(verify.bin,[...verify.prefix,"--file=-"],{env,windowsHide:true,stdio:["pipe","pipe","pipe"]});child.stdout.resume();child.stderr.resume();
      const timer=setTimeout(()=>{child.kill();reject(new Error("VERIFY_TIMEOUT"))},300000);
      const stream=pipeline(createReadStream(/* turbopackIgnore: true */ file!),child.stdin);void stream.catch(()=>child.kill());
      child.on("error",e=>{clearTimeout(timer);reject(e)});child.on("close",code=>{clearTimeout(timer);void stream.then(()=>code===0?done():reject(new Error("VERIFY_FAILED")),reject)});
    });
    const hash=createHash("sha256");for await(const chunk of createReadStream(/* turbopackIgnore: true */ file))hash.update(chunk);
    const sha256=hash.digest("hex");await writeFile(file+".sha256",sha256+"  "+nombre+"\n",{flag:"wx",mode:0o600});
    return {nombre,sha256,bytes};
  }catch{if(file){await unlink(file).catch(()=>{});await unlink(file+".sha256").catch(()=>{});}throw new NegativosError(503,"RESPALDO_REQUERIDO","No se pudo crear y verificar el respaldo. No se borró ningún dato. Compruebe Docker o configure pg_dump y pg_restore en el servidor.");}
}
