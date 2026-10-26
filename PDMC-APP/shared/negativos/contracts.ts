// Contratos sin dependencias ejecutables del servidor, aptos para clientes TS.
import type { Prisma } from "../../generated/prisma/client";
import type { NegativeOperations } from "../../backend/src/negativos/operations";
import type { NegativosService } from "../../backend/src/negativos/service";
export type { ImportInput, RowError, ValidationSummary } from "../../backend/src/negativos/validation";
export type { Comparison, ComparisonSummary } from "../../backend/src/negativos/comparator";

export type Jsonified<T> = T extends Date | Prisma.Decimal ? string :
  T extends (infer U)[] ? Jsonified<U>[] :
  T extends object ? { [K in keyof T]: Jsonified<T[K]> } : T;

export type ApiEnvelope<T> = { ok: true; data: T } | {
  ok: false; error: { code: string; message: string; details?: unknown };
};

// Se infieren del servidor para que el contrato refleje exactamente la respuesta.
// TypeScript elimina estas referencias; no incorporan servicios al navegador.
export type NegativeListing = Jsonified<Awaited<ReturnType<NegativeOperations["listar"]>>>;
export type NegativeDetail = Jsonified<Awaited<ReturnType<NegativosService["detalle"]>>>;
