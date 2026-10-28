ALTER TABLE "Negativo"
  ADD COLUMN "existenciaSistemaConteo" DECIMAL(18,4),
  ADD COLUMN "conteoRegistradoAt" TIMESTAMPTZ(3);

ALTER TABLE "Inconsistencia"
  ADD COLUMN "existenciaSistemaConteo" INTEGER,
  ADD COLUMN "conteoRegistradoAt" TIMESTAMPTZ(3);

ALTER TABLE "Inconsistencia"
  ADD CONSTRAINT "Inconsistencia_existencia_sistema_conteo_entera"
  CHECK ("existenciaSistemaConteo" IS NULL OR "existenciaSistemaConteo" BETWEEN -10000000 AND 10000000);

CREATE INDEX "Negativo_conteoFisico_idx" ON "Negativo"("conteoFisico");
CREATE INDEX "Inconsistencia_conteoFisico_idx" ON "Inconsistencia"("conteoFisico");
