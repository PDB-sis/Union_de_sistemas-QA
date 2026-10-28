import test from "node:test";
import assert from "node:assert/strict";
import { detallePorMotivo, esMotivoNegativo, validarMotivoNegativo } from "../../shared/negativos/reasons.ts";

test("los motivos de negativos exigen únicamente el dato relacionado correspondiente", () => {
  assert.equal(esMotivoNegativo("FACTURACION"), true);
  assert.equal(detallePorMotivo.FACTURACION.label, "Número de transferencia");
  assert.match(validarMotivoNegativo("FACTURACION", "") ?? "", /transferencia/i);
  assert.match(validarMotivoNegativo("MAL AJUSTADO ANTERIORMENTE", "") ?? "", /ajuste anterior/i);
  assert.match(validarMotivoNegativo("CRUCE", "") ?? "", /código de barra/i);
  assert.equal(validarMotivoNegativo("FACTURACION", "81880"), null);
  assert.equal(validarMotivoNegativo("CRUCE", "6900010012345"), null);
  assert.equal(validarMotivoNegativo("ROTACION", ""), null);
  assert.match(validarMotivoNegativo("ROTACION", "documento viejo") ?? "", /no requiere/i);
});

test("un motivo histórico se conserva, pero no se puede asignar a un caso nuevo", () => {
  assert.equal(validarMotivoNegativo("MOTIVO ANTERIOR", "", "MOTIVO ANTERIOR"), null);
  assert.match(validarMotivoNegativo("MOTIVO ANTERIOR", "") ?? "", /motivos disponibles/i);
});
