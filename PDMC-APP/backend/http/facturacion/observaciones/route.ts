import {endpoint,jsonBody} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {BillingObservationService} from "@backend/facturacion/observaciones";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  return endpoint(request,async(_,access)=>new BillingObservationService(getDb(),access).list(Object.fromEntries(new URL(request.url).searchParams.entries())));
}
export async function POST(request:Request){
  return endpoint(request,async(_,access)=>new BillingObservationService(getDb(),access).create(await jsonBody(request)));
}
export async function PATCH(request:Request){
  return endpoint(request,async(_,access)=>new BillingObservationService(getDb(),access).updateStatus(await jsonBody(request)));
}
