// Verifica que backend, frontend y contratos sigan siendo paquetes independientes.
// Reglas:
//  - Ningún paquete importa archivos de otro por ruta relativa; lo compartido se usa como "@pdmc/contratos/...".
//  - frontend: sin backend, base de datos, Node ni variables de entorno del servidor (solo habla por HTTP).
//  - contratos: sin servidor ni interfaz (solo tipos, catálogos y reglas puras).
//  - backend: sin dependencias de la interfaz.
import {readdir,readFile} from "node:fs/promises";
import {resolve,relative,dirname,sep} from "node:path";
import {builtinModules} from "node:module";
import ts from "typescript";

const root=process.cwd();
const builtins=new Set(builtinModules.flatMap(name=>[name,`node:${name}`]));
const SERVIDOR=["pg","mssql","hono","@hono/","@prisma/","prisma","server-only","next","@next/","tsx"];
const INTERFAZ=["react","react-dom","react-router","@radix-ui/","radix-ui","lucide-react","next-themes","sonner","recharts","@base-ui/","vaul","cmdk"];
const PAQUETES={frontend:"frontend/src",backend:"backend",contratos:"contratos/src"};
const errors=[];
const startsWithAny=(spec,list)=>list.some(item=>item.endsWith("/")?spec.startsWith(item):spec===item||spec.startsWith(item+"/"));
const paqueteDe=file=>{const path=relative(root,file).split(sep).join("/");return path.startsWith("frontend/")?"frontend":path.startsWith("backend/")?"backend":path.startsWith("contratos/")?"contratos":"raiz";};

function revisar(paquete,file,spec,typeOnly){
  const name=relative(root,file).split(sep).join("/");
  if(spec.startsWith(".")){
    const destino=paqueteDe(resolve(dirname(file),spec));
    if(destino!==paquete)errors.push(`${name}: importa ${destino} por ruta relativa (${spec}). Use @pdmc/contratos o la API.`);
    return;
  }
  if(paquete==="frontend"){
    if(builtins.has(spec)||startsWithAny(spec,SERVIDOR))errors.push(`${name}: el frontend no puede usar dependencias de servidor (${spec}).`);
    if(spec.startsWith("@backend/"))errors.push(`${name}: el frontend no puede importar el backend (${spec}).`);
  }
  if(paquete==="contratos"){
    if(builtins.has(spec)||startsWithAny(spec,SERVIDOR)&&!typeOnly)errors.push(`${name}: contratos no puede depender del servidor (${spec}).`);
    if(startsWithAny(spec,INTERFAZ))errors.push(`${name}: contratos no puede depender de la interfaz (${spec}).`);
  }
  if(paquete==="backend"&&(spec.startsWith("@/")||startsWithAny(spec,INTERFAZ)))errors.push(`${name}: el backend no puede depender de la interfaz (${spec}).`);
}

async function scan(paquete,dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=resolve(dir,entry.name);
    if(entry.isDirectory()){if(!["node_modules","generated","dist","backups"].includes(entry.name))await scan(paquete,file);continue;}
    if(!/\.[cm]?[jt]sx?$/.test(file))continue;
    const text=await readFile(file,"utf8"),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    const pruebas=relative(root,file).split(sep).includes("tests");
    function visit(node){
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
        const clause=ts.isImportDeclaration(node)?node.importClause:undefined;
        const typeOnly=ts.isImportDeclaration(node)?Boolean(clause?.isTypeOnly):node.isTypeOnly;
        // Las pruebas pueden usar Node (node:test, fs…), pero tampoco cruzan paquetes.
        if(!(pruebas&&!node.moduleSpecifier.text.startsWith(".")))revisar(paquete,file,node.moduleSpecifier.text,typeOnly);
        else if(pruebas)revisar(paquete,file,node.moduleSpecifier.text.startsWith(".")?node.moduleSpecifier.text:"@pdmc/contratos",typeOnly);
      }
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))revisar(paquete,file,node.arguments[0].text,false);
      if(paquete!=="backend"&&!pruebas&&ts.isPropertyAccessExpression(node)&&node.getText(source)==="process.env")errors.push(`${relative(root,file)}: las variables de entorno del servidor pertenecen al backend.`);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}

for(const [paquete,dir] of Object.entries(PAQUETES))await scan(paquete,resolve(root,dir));
// Las pruebas del frontend también se revisan por cruces de paquete.
await scan("frontend",resolve(root,"frontend/tests"));
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}
else console.info("Arquitectura verificada: backend, frontend y contratos son paquetes independientes.");
