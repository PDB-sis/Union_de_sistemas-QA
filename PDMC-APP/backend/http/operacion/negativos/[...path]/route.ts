import { requireOrigin } from "@backend/auth/http";
import { endpoint, jsonBody, pagination } from "@backend/negativos/http";
import { NegativeOperations } from "@backend/negativos/operations";
import { getDb } from "@backend/db";
import { NegativosError, uuid } from "@backend/negativos/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All operation routes additionally require an active, non-temporary session
// in the shared endpoint wrapper. Origin validation protects writes from CSRF.
export const sameOrigin = requireOrigin;

type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  return endpoint(request, async (service, access) => {
    const path = (await context.params).path;
    const route = path.join("/");
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const ops = new NegativeOperations(getDb(),access);
    if (request.method === "GET") {
      if (route === "bodegas") return ops.bodegas();
      if (route === "bodegas-producto") return ops.bodegasProducto();
      if (route === "lista") return ops.listar(params);
      if (path[0] === "casos" && path.length === 2) { const p = pagination.parse(params); return service.detalle(p.bodegaId, uuid.parse(path[1]), p.skip, p.take); }
    }
    if (request.method === "POST") {
      const body = await jsonBody(request);
      if (route === "bodegas") return ops.crearBodega(body);
      if (route === "lista/estado") return ops.masivo(body);
      if (path[0] === "casos" && path[2] === "anular" && path.length === 3) return ops.anularCaso(path[1], body);
    }
    if (request.method === "PATCH" && path[0] === "casos" && path.length === 2) return ops.editar(path[1], await jsonBody(request));
    throw new NegativosError(404, "RUTA", "Operación no encontrada.");
  }, sameOrigin);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
