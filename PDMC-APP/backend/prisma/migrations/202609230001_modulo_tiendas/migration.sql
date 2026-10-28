CREATE TYPE "OrigenInconsistencia" AS ENUM ('SHEET', 'APP_TIENDA');
CREATE TYPE "MotivoReporteTienda" AS ENUM ('FALTANTE', 'SOBRANTE', 'CRUCE', 'DANADO', 'VENCIDO', 'OTRO');

ALTER TABLE "Inconsistencia"
  ALTER COLUMN "sheetRow" DROP NOT NULL,
  ADD COLUMN "origen" "OrigenInconsistencia" NOT NULL DEFAULT 'SHEET',
  ADD COLUMN "motivoReporte" "MotivoReporteTienda",
  ADD COLUMN "detalleOtro" VARCHAR(300),
  ADD COLUMN "tiendaId" UUID,
  ADD COLUMN "reportadoPorId" UUID,
  ADD COLUMN "grupoReporteId" UUID,
  ADD COLUMN "claveCruce" UUID;

ALTER TABLE "Inconsistencia"
  ADD CONSTRAINT "Inconsistencia_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Inconsistencia_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Inconsistencia_tiendaId_resuelto_createdAt_idx" ON "Inconsistencia"("tiendaId", "resuelto", "createdAt");
CREATE INDEX "Inconsistencia_reportadoPorId_createdAt_idx" ON "Inconsistencia"("reportadoPorId", "createdAt");
CREATE INDEX "Inconsistencia_grupoReporteId_idx" ON "Inconsistencia"("grupoReporteId");
CREATE INDEX "Inconsistencia_claveCruce_idx" ON "Inconsistencia"("claveCruce");
