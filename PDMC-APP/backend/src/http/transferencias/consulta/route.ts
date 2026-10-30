import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {TransferQueryService} from "@backend/transferencias/consulta";
export const runtime="nodejs";export const dynamic="force-dynamic";
// Las transferencias llegan desde SQL Server (/api/sincronizacion); no se cargan archivos.
export async function GET(request:Request){return endpoint(request,async(_,access)=>new TransferQueryService(getDb(),access).status());}
