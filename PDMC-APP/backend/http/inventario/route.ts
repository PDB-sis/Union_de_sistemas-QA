import { endpoint,jsonBody } from "@backend/negativos/http";
import { NegativosError } from "@backend/negativos/validation";
import { InventoryService } from "@backend/inventario/service";
import { getDb } from "@backend/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return endpoint(request,async(_,access)=>{const service=new InventoryService(getDb(),access),url=new URL(request.url);if(url.searchParams.get("vista")==="productos")return service.products(Object.fromEntries(url.searchParams.entries()).linea?{linea:url.searchParams.get("linea"),q:url.searchParams.get("q")??"",skip:url.searchParams.get("skip")??"0",take:url.searchParams.get("take")??"25"}:{});return service.summary();});}
export async function POST(request:Request){return endpoint(request,async(_,access)=>{
  const action=new URL(request.url).searchParams.get("accion"),body=await jsonBody(request,105_000_000),service=new InventoryService(getDb(),access);
  if(action==="validar")return service.preview(body);
  if(action==="importar")return service.import(body);
  if(action==="crear-bodega")return service.createWarehouse(body);
  throw new NegativosError(404,"RUTA","Operación de inventario no encontrada.");
});}
export async function PATCH(request:Request){return endpoint(request,async(_,access)=>{const body=await jsonBody(request),service=new InventoryService(getDb(),access);return body&&typeof body==="object"&&"productoId" in body?service.assignProduct(body):service.assign(body);});}
