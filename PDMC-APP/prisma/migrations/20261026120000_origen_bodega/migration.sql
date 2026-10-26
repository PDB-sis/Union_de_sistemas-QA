-- Fase 3b de PLAN-agente-multisitio.md: transferencias y devoluciones guardan su
-- bodega de origen, porque los números se repiten entre bodegas. El número pasa a
-- ser único dentro de cada bodega. NULLS NOT DISTINCT mantiene la unicidad de lo
-- que no tenga bodega (PostgreSQL 15 o posterior).
ALTER TABLE "TransferenciaConsulta" ADD COLUMN "origenId" UUID;
ALTER TABLE "DevolucionConsulta" ADD COLUMN "origenId" UUID;
ALTER TABLE "TransferenciaConsulta" ADD CONSTRAINT "TransferenciaConsulta_origenId_fkey"
  FOREIGN KEY ("origenId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevolucionConsulta" ADD CONSTRAINT "DevolucionConsulta_origenId_fkey"
  FOREIGN KEY ("origenId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Todo lo importado hasta hoy viene de la bodega MARACAIBO (dimID_Tienda 2004), la
-- única que se ha leído. Si esa bodega no está en el catálogo, queda sin origen.
UPDATE "TransferenciaConsulta" SET "origenId" = (SELECT id FROM "Ubicacion" WHERE "dimIdTienda" = 2004) WHERE "origenId" IS NULL;
UPDATE "DevolucionConsulta" SET "origenId" = (SELECT id FROM "Ubicacion" WHERE "dimIdTienda" = 2004) WHERE "origenId" IS NULL;

ALTER TABLE "TransferenciaConsulta" DROP CONSTRAINT "TransferenciaConsulta_numero_key";
ALTER TABLE "DevolucionConsulta" DROP CONSTRAINT "DevolucionConsulta_numero_key";
CREATE UNIQUE INDEX "TransferenciaConsulta_origenId_numero_key" ON "TransferenciaConsulta"("origenId", "numero") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "DevolucionConsulta_origenId_numero_key" ON "DevolucionConsulta"("origenId", "numero") NULLS NOT DISTINCT;
CREATE INDEX "TransferenciaConsulta_numero_idx" ON "TransferenciaConsulta"("numero");
CREATE INDEX "DevolucionConsulta_numero_idx" ON "DevolucionConsulta"("numero");
