import {endpoint,jsonBody} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {InconsistencyService} from "@backend/inconsistencias/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return endpoint(request,async(_,access)=>{const params=Object.fromEntries(new URL(request.url).searchParams.entries()),service=new InconsistencyService(getDb(),access);return params.vista==="productos"?service.productProblems(params):service.list(params)});}
export async function POST(request:Request){return endpoint(request,async(_,access)=>new InconsistencyService(getDb(),access).updateMany(await jsonBody(request)));}
export async function PATCH(request:Request){return endpoint(request,async(_,access)=>{const body=await jsonBody(request),service=new InconsistencyService(getDb(),access);return body&&typeof body==="object"&&Object.keys(body).every(key=>["id","version","conteoFisico"].includes(key))?service.count(body):service.update(body);});}
