ALTER TABLE "Inconsistencia" ADD COLUMN "reporteTiendaId" UUID;
ALTER TABLE "InconsistenciaCodigoNoInventario" ADD COLUMN "reporteTiendaId" UUID;

UPDATE "Inconsistencia" AS i
SET "reporteTiendaId" = r.id
FROM "ReporteTransferenciaTienda" AS r
WHERE i.origen = 'APP_TIENDA'
  AND i."tiendaId" = r."tiendaId"
  AND i.transferencia = r.transferencia;

UPDATE "InconsistenciaCodigoNoInventario" AS i
SET "reporteTiendaId" = r.id
FROM "ReporteTransferenciaTienda" AS r
WHERE i."tiendaId" = r."tiendaId"
  AND i.transferencia = r.transferencia;

-- Retira reportes de prueba huérfanos anteriores a esta relación.
DELETE FROM "Inconsistencia"
WHERE origen = 'APP_TIENDA' AND "reporteTiendaId" IS NULL;

DELETE FROM "InconsistenciaCodigoNoInventario"
WHERE "reporteTiendaId" IS NULL;

CREATE INDEX "Inconsistencia_reporteTiendaId_idx" ON "Inconsistencia"("reporteTiendaId");
CREATE INDEX "InconsistenciaCodigoNoInventario_reporteTiendaId_idx" ON "InconsistenciaCodigoNoInventario"("reporteTiendaId");

ALTER TABLE "Inconsistencia"
ADD CONSTRAINT "Inconsistencia_reporteTiendaId_fkey"
FOREIGN KEY ("reporteTiendaId") REFERENCES "ReporteTransferenciaTienda"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InconsistenciaCodigoNoInventario"
ADD CONSTRAINT "InconsistenciaCodigoNoInventario_reporteTiendaId_fkey"
FOREIGN KEY ("reporteTiendaId") REFERENCES "ReporteTransferenciaTienda"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
