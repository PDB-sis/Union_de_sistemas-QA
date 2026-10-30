import {readdir,readFile} from "node:fs/promises";
import {extname,join,relative} from "node:path";
import ts from "typescript";

const roots=["app","frontend","backend","shared","public","scripts","tests","docs"];
const extensions=new Set([".ts",".tsx",".js",".mjs",".cjs",".json",".css",".md",".sql",".svg",".html"]);
const ignored=new Set(["generated","node_modules","vendor",".next","dist",".salida","entregables"]);
const suspiciousCharacters=new Set([String.fromCodePoint(0x00c2),String.fromCodePoint(0x00c3),String.fromCodePoint(0x00e2),String.fromCodePoint(0xfffd)]);
const findings=[];

async function files(directory){
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const path=join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(path));
    else if(extensions.has(extname(entry.name).toLowerCase()))result.push(path);
  }
  return result;
}

function lineOf(text,index){return text.slice(0,index).split("\n").length;}
function inspectText(path,text,value,index){
  if(/\p{L}\?\p{L}/u.test(value)&&!/^[\w./-]+\?[\w=&%/-]+$/u.test(value)&&!/^https?:\/\//u.test(value))findings.push(`${relative(process.cwd(),path)}:${lineOf(text,index)} contiene un signo de interrogación dentro de una palabra`);
}

for(const root of roots){
  let paths=[];
  try{paths=await files(root)}catch(error){if(error?.code!=="ENOENT")throw error;}
  for(const path of paths){
    const text=await readFile(path,"utf8");
    for(const character of suspiciousCharacters){const index=text.indexOf(character);if(index>=0){findings.push(`${relative(process.cwd(),path)}:${lineOf(text,index)} contiene una secuencia de codificación inválida`);break;}}
    if(![".ts",".tsx",".js",".mjs",".cjs"].includes(extname(path).toLowerCase()))continue;
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith("x")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=node=>{
      if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)&&/\\u[0-9a-f]{4}/iu.test(node.initializer.getText(source))){
        findings.push(`${relative(process.cwd(),path)}:${lineOf(text,node.initializer.getStart(source))} contiene un escape Unicode visible dentro de un atributo JSX`);
      }
      if(ts.isStringLiteralLike(node)||ts.isJsxText(node))inspectText(path,text,node.text,node.getStart(source));
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
}

if(findings.length){
  console.error("Se encontraron textos deformados:\n"+findings.join("\n"));
  process.exitCode=1;
}else console.log("Textos verificados: UTF-8 correcto y sin secuencias deformadas.");
