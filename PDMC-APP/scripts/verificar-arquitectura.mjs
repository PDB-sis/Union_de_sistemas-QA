import {readdir,readFile} from "node:fs/promises";
import {resolve,relative,dirname} from "node:path";
import {builtinModules} from "node:module";
import ts from "typescript";

const root=process.cwd();
const config=ts.readConfigFile(resolve(root,"tsconfig.json"),ts.sys.readFile);
if(config.error)throw new Error("No se pudo leer tsconfig.json.");
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
const builtins=new Set(builtinModules.flatMap(name=>[name,`node:${name}`]));
const errors=[];
async function scan(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=resolve(dir,entry.name);
    if(entry.isDirectory()){await scan(file);continue;}
    if(!/\.[cm]?[jt]sx?$/.test(file))continue;
    const text=await readFile(file,"utf8"),name=relative(root,file).replaceAll("\\","/");
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    const layer=name.split("/")[0];
    function inspect(spec,typeOnly=false){
      const resolved=ts.resolveModuleName(spec,file,options,ts.sys).resolvedModule?.resolvedFileName;
      const path=resolved?relative(root,resolved).replaceAll("\\","/"):spec.startsWith(".")?relative(root,resolve(dirname(file),spec)).replaceAll("\\","/"):spec;
      const server=path.startsWith("backend/")||path.startsWith("generated/")||builtins.has(spec)||spec==="server-only"||spec==="pg"||spec.startsWith("@prisma/");
      if(layer==="frontend"&&server)errors.push(`${name}: dependencia de servidor prohibida: ${spec}`);
      if(layer==="shared"&&server&&!typeOnly)errors.push(`${name}: shared solo puede referenciar tipos del servidor: ${spec}`);
      if(layer==="backend"&&path.startsWith("frontend/"))errors.push(`${name}: el backend no puede depender de la interfaz: ${spec}`);
    }
    function visit(node){
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
        const clause=ts.isImportDeclaration(node)?node.importClause:node.exportClause;
        const typeOnly=ts.isImportDeclaration(node)?Boolean(clause?.isTypeOnly||(!clause?.name&&clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(e=>e.isTypeOnly))):node.isTypeOnly;
        inspect(node.moduleSpecifier.text,typeOnly);
      }
      if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))inspect(node.argument.literal.text,true);
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(source)==="require")&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))inspect(node.arguments[0].text);
      if(layer!=="backend"&&ts.isPropertyAccessExpression(node)&&node.getText(source)==="process.env")errors.push(`${name}: las variables de entorno pertenecen al backend.`);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
for(const layer of ["frontend","backend","shared"])await scan(resolve(root,layer));
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}
else console.info("Arquitectura verificada: frontend, backend y contratos compartidos separados.");
