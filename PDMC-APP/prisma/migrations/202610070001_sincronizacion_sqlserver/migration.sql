BEGIN;

CREATE TABLE "SincronizacionEstado" (
  "modulo" VARCHAR(80) NOT NULL,
  "ultimoIntentoEn" TIMESTAMPTZ(3),
  "ultimoExitoEn" TIMESTAMPTZ(3),
  "ultimoError" VARCHAR(2000),
  "ultimoHash" VARCHAR(64),
  "bloqueoId" VARCHAR(64),
  "bloqueoHasta" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SincronizacionEstado_pkey" PRIMARY KEY ("modulo")
);

CREATE TABLE "SincronizacionEjecucion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "modulo" VARCHAR(80) NOT NULL,
  "estado" VARCHAR(20) NOT NULL,
  "totalFilas" INTEGER,
  "error" VARCHAR(2000),
  "detalle" JSONB,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SincronizacionEjecucion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SincronizacionEjecucion_estado_check"
    CHECK ("estado" IN ('EJECUTANDO', 'EXITOSA', 'SIN_CAMBIOS', 'FALLIDA')),
  CONSTRAINT "SincronizacionEjecucion_totalFilas_check"
    CHECK ("totalFilas" IS NULL OR "totalFilas" >= 0)
);
CREATE INDEX "SincronizacionEjecucion_modulo_startedAt_idx"
  ON "SincronizacionEjecucion"("modulo", "startedAt");
CREATE INDEX "SincronizacionEjecucion_estado_startedAt_idx"
  ON "SincronizacionEjecucion"("estado", "startedAt");

COMMIT;
