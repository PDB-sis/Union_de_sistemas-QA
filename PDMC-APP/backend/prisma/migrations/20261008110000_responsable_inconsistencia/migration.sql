CREATE TYPE "ResponsableInconsistencia" AS ENUM ('SIN_DETERMINAR', 'FACTURACION', 'BODEGA', 'TIENDA', 'TRANSPORTE', 'SISTEMA');
ALTER TABLE "Inconsistencia" ADD COLUMN "responsable" "ResponsableInconsistencia" NOT NULL DEFAULT 'SIN_DETERMINAR';
UPDATE "Inconsistencia"
SET "responsable" = 'FACTURACION'
WHERE lower(translate(coalesce("motivo", ''), 'íóáéú', 'ioaeu')) IN (
  'error por facturador (fisico faltante)',
  'no se facturo la mercancia(no esta en transf)'
);
CREATE INDEX "Inconsistencia_responsable_fecha_idx" ON "Inconsistencia"("responsable", "fecha");
