import { endpoint, jsonBody } from "@backend/negativos/http";
import { Administration } from "@backend/admin/service";
import { getDb } from "@backend/db";
import { AuthError } from "@backend/auth/service";
import {ProjectReset} from "@backend/admin/reset";
import {requestToken} from "@backend/auth/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{path:string[]}>};
async function handle(request:Request,context:Context) {
  return endpoint(request,async(_service,access)=>{
    const path=(await context.params).path.join("/");
    const admin=new Administration(getDb(),access.userId!,`WEB ${request.method} /api/admin/${path}`.slice(0,300));
    const reset=new ProjectReset(getDb(),access,requestToken(request)!);
    if(request.method==="GET") {
      const filters=Object.fromEntries(new URL(request.url).searchParams);
      if(path==="usuarios")return admin.users(filters);
      if(path==="entidades")return admin.entities(filters);
      if(path==="auditoria")return admin.auditLog(filters);
      if(path==="restablecer")return reset.preview();
    }
    if(request.method==="POST"||request.method==="PATCH") {
      const body=await jsonBody(request,64000);
      if(path==="restablecer/preparar"&&request.method==="POST")return reset.prepare(body);
      if(path==="restablecer/ejecutar"&&request.method==="POST")return reset.execute(body);
      if(path==="usuarios"&&request.method==="POST")return admin.createUser(body);
      if(path==="usuarios"&&request.method==="PATCH")return admin.editUser(body);
      if(path==="usuarios/estado"&&request.method==="POST")return admin.status(body);
      if(path==="usuarios/password"&&request.method==="POST")return admin.password(body);
      if(path==="usuarios/reasignar"&&request.method==="POST")return admin.transferCases(body);
      if(path==="entidades"&&request.method==="POST")return admin.createEntity(body);
      if(path==="entidades"&&request.method==="PATCH")return admin.updateEntity(body);
      if(path==="entidades/asignar-region"&&request.method==="POST")return admin.assignStoresRegion(body);
      if(path==="entidades/vinculos"&&request.method==="POST")return admin.link(body);
      if(path==="entidades/eliminar"&&request.method==="POST")return admin.deleteEntity(body);
    }
    throw new AuthError(404,"RUTA","Operación no disponible.");
  });
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
