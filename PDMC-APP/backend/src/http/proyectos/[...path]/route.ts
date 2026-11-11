import {endpoint,jsonBody} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {NegativosError} from "@backend/negativos/validation";
import {ProjectService} from "@backend/proyectos/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// /api/proyectos            GET lista · POST crear
// /api/proyectos/personas   GET directorio para compartir
// /api/proyectos/importar   POST proyectos guardados en el navegador
// /api/proyectos/:id        GET detalle · PATCH cambios
// /api/proyectos/:id/miembros[/:usuarioId]   POST compartir · DELETE quitar
// /api/proyectos/:id/tareas[/:tareaId]       POST crear · PATCH cambiar · DELETE eliminar
// /api/proyectos/:id/comentarios             POST comentar
type Context={params:Promise<{path?:string[]}>};
const partes=async(context:Context)=>(await context.params).path?.filter(Boolean)??[];
const noExiste=()=>{throw new NegativosError(404,"RUTA","Operación no encontrada.")};

export async function GET(request:Request,context:Context){
  const path=await partes(context);
  return endpoint(request,async(_,access)=>{const service=new ProjectService(getDb(),access);
    if(!path.length)return service.list();
    if(path[0]==="personas"&&path.length===1)return service.people(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if(path.length===1)return service.get(path[0]);
    return noExiste();});
}
export async function POST(request:Request,context:Context){
  const path=await partes(context);
  return endpoint(request,async(_,access)=>{const service=new ProjectService(getDb(),access),body=await jsonBody(request);
    if(!path.length)return service.create(body);
    if(path[0]==="importar"&&path.length===1)return service.importLocal(body);
    if(path.length===2&&path[1]==="miembros")return service.addMember(path[0],body);
    if(path.length===2&&path[1]==="tareas")return service.addTask(path[0],body);
    if(path.length===2&&path[1]==="comentarios")return service.comment(path[0],body);
    return noExiste();});
}
export async function PATCH(request:Request,context:Context){
  const path=await partes(context);
  return endpoint(request,async(_,access)=>{const service=new ProjectService(getDb(),access),body=await jsonBody(request);
    if(path.length===1)return service.update(path[0],body);
    if(path.length===3&&path[1]==="tareas")return service.updateTask(path[0],path[2],body);
    return noExiste();});
}
export async function DELETE(request:Request,context:Context){
  const path=await partes(context);
  return endpoint(request,async(_,access)=>{const service=new ProjectService(getDb(),access);
    if(path.length===3&&path[1]==="miembros")return service.removeMember(path[0],path[2]);
    if(path.length===3&&path[1]==="tareas")return service.deleteTask(path[0],path[2]);
    return noExiste();});
}
