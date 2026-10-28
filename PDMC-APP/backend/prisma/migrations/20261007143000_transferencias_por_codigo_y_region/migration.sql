-- La consulta empresarial identifica tiendas por su código estable.
-- Los registros ya enlazados conservan la relación y reciben el código registrado en PDMC.
ALTER TABLE "TransferenciaConsulta"
  RENAME COLUMN "destinoOriginal" TO "codigoTiendaConsulta";

UPDATE "TransferenciaConsulta" AS transferencia
SET "codigoTiendaConsulta" = ubicacion.codigo
FROM "Ubicacion" AS ubicacion
WHERE transferencia."tiendaId" = ubicacion.id;

CREATE INDEX "TransferenciaConsulta_codigoTiendaConsulta_idx"
  ON "TransferenciaConsulta"("codigoTiendaConsulta");
