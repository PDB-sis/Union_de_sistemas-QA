import { Authorization } from "../auth/authorization";
import { auditContext } from "../audit-context";
import "server-only";
import { requireApiSession, requireOrigin } from "../auth/http";
import { AuthError } from "../auth/service";
import { z } from "zod";
import { getDb } from "../db";
import { NegativosService } from "./service";
import { NegativosError, uuid } from "./validation";
import type { ApiEnvelope } from "../../../shared/negativos/contracts";
import {enterApiRequest} from "../maintenance";

export const pagination = z.object({
  bodegaId: uuid,
  skip: z.coerce.number().int().min(0).max(100000).default(0),
  take: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export async function jsonBody(request: Request, maxBytes = 3_000_000) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new NegativosError(415, "FORMATO", "Use application/json.");
  // Se mide el stream, no se confía en Content-Length enviado por el cliente.
  const reader = request.body?.getReader();
  if (!reader) throw new NegativosError(400, "JSON_INVALIDO", "Cuerpo JSON requerido.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new NegativosError(413, "CUERPO_GRANDE", "El cuerpo supera el límite permitido."); }
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof NegativosError || error instanceof AuthError) throw error;
    throw new NegativosError(400, "JSON_INVALIDO", "JSON o UTF-8 inválido.");
  } finally { reader.releaseLock(); }
}

export async function endpoint<T>(request: Request, action: (service: NegativosService, access: Authorization) => Promise<T>, guard: (request: Request) => void = requireOrigin) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  let release:(()=>void)|undefined;
  try {
    release=enterApiRequest();
    const session = await requireApiSession(request);
    const access = new Authorization(getDb(),session.usuario.id);
    guard(request);
    const body: ApiEnvelope<T> = { ok: true, data: await auditContext.run({usuarioId:session.usuario.id,origen:`WEB ${request.method} ${new URL(request.url).pathname}`.slice(0,300)},()=>action(new NegativosService(getDb(),access),access)) };
    return Response.json(body, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ ok: false, error: { code: "VALIDACION", message: "Parámetros inválidos.", details: error.issues.map(i => ({ campo: i.path.join("."), mensaje: i.message })) } }, { status: 422, headers });
    if (error instanceof NegativosError || error instanceof AuthError) return Response.json({ ok: false, error: { code: error.code, message: error.message, details: "details" in error ? error.details : undefined } }, { status: error.status, headers });
    // No serializar errores Prisma/pg: pueden contener SQL, conexión o datos.
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    const conflict = ["P2002", "P2034"].includes(code);
    return Response.json({ ok: false, error: { code: conflict ? "CONFLICTO" : "SERVICIO_NO_DISPONIBLE", message: conflict ? "Conflicto concurrente; reintente la operación." : "No se pudo completar la operación. Revise la conexión del servidor." } }, { status: conflict ? 409 : 503, headers });
  } finally {release?.();}
}
