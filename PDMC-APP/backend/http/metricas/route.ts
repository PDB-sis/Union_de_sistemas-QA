import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {MetricsService} from "@backend/metrics/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){return endpoint(request,async(_,access)=>new MetricsService(getDb(),access).dashboard());}
