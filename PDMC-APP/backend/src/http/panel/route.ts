import {endpoint} from "@backend/negativos/http";
import {requireApiSession} from "@backend/auth/http";
import {NegativosError} from "@backend/negativos/validation";
import {loadAdministration,loadDashboard,loadStore} from "@backend/panel/bootstrap";

// GET /api/panel?vista=inicio|tienda|administracion
// Reemplaza la carga que antes hacían las páginas de Next.js en el servidor: el frontend pide
// los datos iniciales y navega según la respuesta (contrato en contratos/src/panel.ts).
// La sesión con contraseña temporal se consulta con GET /api/auth/sesion.
export async function GET(request:Request){
  const vista=new URL(request.url).searchParams.get("vista")??"inicio";
  return endpoint(request,async()=>{
    const user=(await requireApiSession(request)).usuario;
    if(vista==="inicio")return loadDashboard(user);
    if(vista==="tienda")return loadStore(user);
    if(vista==="administracion")return loadAdministration(user);
    throw new NegativosError(404,"RUTA","Vista no encontrada.");
  });
}
