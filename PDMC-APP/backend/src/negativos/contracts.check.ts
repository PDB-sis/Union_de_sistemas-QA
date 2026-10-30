// Verificación en compilación (no se ejecuta): las respuestas reales de negativos deben cumplir
// el contrato que usa el frontend (contratos/src/negativos/contracts.ts). Si un servicio cambia
// su respuesta y el contrato no, `npm run typecheck` falla aquí.
import type { Jsonified, NegativeDetail, NegativeListing } from "@pdmc/contratos/negativos/contracts";
import type { NegativeOperations } from "./operations";
import type { NegativosService } from "./service";

type Cumple<Real extends Contrato, Contrato> = Real;

export type ListadoCumpleContrato = Cumple<Jsonified<Awaited<ReturnType<NegativeOperations["listar"]>>>, NegativeListing>;
export type DetalleCumpleContrato = Cumple<Jsonified<Awaited<ReturnType<NegativosService["detalle"]>>>, NegativeDetail>;
