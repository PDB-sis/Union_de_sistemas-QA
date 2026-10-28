BEGIN;

CREATE TYPE "SubmotivoReporteTienda" AS ENUM (
  'UNIDADES_MAS_PAQUETE',
  'NO_ESTA_TRANSFERENCIA',
  'UNIDADES_MENOS_PAQUETE',
  'NO_ESTA_FISICO'
);
CREATE TYPE "MotivoCodigoNoInventario" AS ENUM (
  'CODIGO_MEZCLADO_PAQUETE',
  'OTRA_PRENDA',
  'OTRO'
);

ALTER TABLE "Inconsistencia" ADD COLUMN "submotivoReporte" "SubmotivoReporteTienda";

CREATE TABLE "ReporteTransferenciaTienda" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "solicitudId" UUID NOT NULL,
  "tiendaId" UUID NOT NULL,
  "reportadoPorId" UUID NOT NULL,
  "transferencia" VARCHAR(128) NOT NULL,
  "sinIncidencias" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReporteTransferenciaTienda_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReporteTransferenciaTienda_solicitudId_key" UNIQUE ("solicitudId"),
  CONSTRAINT "ReporteTransferenciaTienda_tiendaId_transferencia_key" UNIQUE ("tiendaId", "transferencia"),
  CONSTRAINT "ReporteTransferenciaTienda_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReporteTransferenciaTienda_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReporteTransferenciaTienda_reportadoPorId_createdAt_idx" ON "ReporteTransferenciaTienda"("reportadoPorId", "createdAt");

CREATE TABLE "InconsistenciaCodigoNoInventario" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "solicitudId" UUID NOT NULL,
  "tiendaId" UUID NOT NULL,
  "reportadoPorId" UUID NOT NULL,
  "transferencia" VARCHAR(128) NOT NULL,
  "codigoBarraNoInventario" VARCHAR(128) NOT NULL,
  "motivo" "MotivoCodigoNoInventario" NOT NULL,
  "codigoBarraTransferencia" VARCHAR(128),
  "cantidadPaquete" INTEGER,
  "cantidadCodigoNoInventario" INTEGER,
  "cantidad" INTEGER,
  "detalle" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InconsistenciaCodigoNoInventario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InconsistenciaCodigoNoInventario_solicitudId_key" UNIQUE ("solicitudId"),
  CONSTRAINT "InconsistenciaCodigoNoInventario_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InconsistenciaCodigoNoInventario_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodigoNoInventario_cantidades_positivas" CHECK (
    ("cantidadPaquete" IS NULL OR "cantidadPaquete" > 0) AND
    ("cantidadCodigoNoInventario" IS NULL OR "cantidadCodigoNoInventario" > 0) AND
    ("cantidad" IS NULL OR "cantidad" > 0)
  )
);
CREATE INDEX "InconsistenciaCodigoNoInventario_tiendaId_createdAt_idx" ON "InconsistenciaCodigoNoInventario"("tiendaId", "createdAt");
CREATE INDEX "InconsistenciaCodigoNoInventario_transferencia_idx" ON "InconsistenciaCodigoNoInventario"("transferencia");
CREATE INDEX "InconsistenciaCodigoNoInventario_codigoBarraNoInventario_idx" ON "InconsistenciaCodigoNoInventario"("codigoBarraNoInventario");

COMMIT;
