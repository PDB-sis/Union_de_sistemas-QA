import { z } from "zod";
import { auditContext } from "@backend/audit-context";
import { getDb } from "@backend/db";
import { AuthError, AuthService } from "@backend/auth/service";
import { requireOrigin, requestToken, requireApiSession, sessionCookie } from "@backend/auth/http";
import {enterApiRequest} from "@backend/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function json(request:Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthError(415,"FORMATO","Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400,"FORMATO","Solicitud incompleta.");
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while (true) {const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>8192){await reader.cancel();throw new AuthError(413,"TAMANO","Solicitud demasiado grande.");}chunks.push(next.value);}
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
  } catch(e) {if(e instanceof AuthError)throw e;throw new AuthError(400,"FORMATO","Solicitud no válida.");}
  finally {reader.releaseLock();}
}
type Context={params:Promise<{action:string}>};
async function handle(request:Request,context:Context) {
  const headers:Record<string,string>={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
  let release:(()=>void)|undefined;
  try {
    release=enterApiRequest();
    requireOrigin(request);
    const action=(await context.params).action;
    const service=new AuthService(getDb());
    if(request.method==="GET"&&action==="sesion")return Response.json({ok:true,data:(await requireApiSession(request,true)).usuario},{headers});
    if(request.method!=="POST")throw new AuthError(404,"RUTA","Operación no encontrada.");
    const body=await json(request);
    if(action==="login") {
      const result=await service.login(body);
      headers["Set-Cookie"]=sessionCookie(result.token,result.seconds);
      const reset=await getDb().restablecimientoProyecto.findFirst({where:{consumidoAt:{not:null}},orderBy:{consumidoAt:"desc"},select:{id:true}});
      return Response.json({ok:true,data:{destino:result.debeCambiarPassword?"/cambiar-contrasena":"/",reinicio:reset?.id??null}},{headers});
    }
    if(action==="logout") {
      z.object({}).strict().parse(body);
      await service.logout(requestToken(request));
    } else if(action==="password") {
      await service.changePassword(requestToken(request),body);
    } else throw new AuthError(404,"RUTA","Operación no encontrada.");
    headers["Set-Cookie"]=sessionCookie("",0);
    return Response.json({ok:true,data:{destino:"/login"}},{headers});
  } catch(e) {
    const error=e instanceof AuthError?e:e instanceof z.ZodError?new AuthError(422,"VALIDACION","Revise los campos. La contraseña nueva debe tener entre 12 y 128 caracteres."):new AuthError(503,"NO_DISPONIBLE","No se pudo completar la operación. Reintente en unos instantes.");
    return Response.json({ok:false,error:{code:error.code,message:error.message}},{status:error.status,headers});
  } finally {release?.();}
}
const dispatch=(request:Request,context:Context)=>auditContext.run({origen:`WEB ${request.method} ${new URL(request.url).pathname}`.slice(0,300)},()=>handle(request,context));
export const GET=dispatch;
export const POST=dispatch;
