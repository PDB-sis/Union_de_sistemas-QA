import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {TransferQueryService} from "@backend/transferencias/consulta";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{numero:string}>}){
  return endpoint(request,async(_,access)=>new TransferQueryService(getDb(),access).detail((await params).numero));
}
