import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {ReturnsService} from "@backend/devoluciones/service";

export const runtime="nodejs";export const dynamic="force-dynamic";
// Las devoluciones llegan desde SQL Server (/api/sincronizacion); no se cargan archivos.
export async function GET(request:Request){return endpoint(request,async(_,access)=>new ReturnsService(getDb(),access).list());}
