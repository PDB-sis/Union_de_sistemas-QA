import {endpoint,jsonBody} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {StoreService} from "@backend/tienda/service";
import {NegativosError} from "@backend/negativos/validation";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  return endpoint(request,async(_,access)=>{
    const action=new URL(request.url).searchParams.get("accion")??"inicio",service=new StoreService(getDb(),access);
    if(action==="inicio")return service.dashboard();
    if(action==="producto")return service.product(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if(action==="catalogo-pedidos")return service.orderCatalog(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if(action==="pedidos")return service.orders();
    throw new NegativosError(404,"RUTA","Operación no encontrada.");
  });
}

export async function POST(request:Request){
  return endpoint(request,async(_,access)=>{
    const action=new URL(request.url).searchParams.get("accion"),service=new StoreService(getDb(),access);
    if(action==="reportar")return service.report(await jsonBody(request));
    if(action==="sin-incidencias")return service.reportSuccessful(await jsonBody(request));
    if(action==="finalizar-con-incidencias")return service.completeWithIncidents(await jsonBody(request));
    if(action==="codigo-no-inventario")return service.reportUnknownBarcode(await jsonBody(request));
    if(action==="pedidos")return service.createOrder(await jsonBody(request));
    throw new NegativosError(404,"RUTA","Operación no encontrada.");
  });
}
