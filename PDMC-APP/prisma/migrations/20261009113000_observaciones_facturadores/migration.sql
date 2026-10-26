CREATE TABLE "ObservacionFacturador" (
    "id" UUID NOT NULL,
    "perfilId" UUID NOT NULL,
    "autorId" UUID NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "detalle" TEXT NOT NULL,
    "prioridad" VARCHAR(12) NOT NULL DEFAULT 'MEDIA',
    "estado" VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE',
    "transferencia" VARCHAR(128),
    "leidaAt" TIMESTAMPTZ(3),
    "atendidaAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ObservacionFacturador_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ObservacionFacturador_prioridad_check" CHECK ("prioridad" IN ('BAJA', 'MEDIA', 'ALTA')),
    CONSTRAINT "ObservacionFacturador_estado_check" CHECK ("estado" IN ('PENDIENTE', 'LEIDA', 'ATENDIDA'))
);

ALTER TABLE "ObservacionFacturador"
  ADD CONSTRAINT "ObservacionFacturador_perfilId_fkey"
  FOREIGN KEY ("perfilId") REFERENCES "PerfilLaboral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ObservacionFacturador"
  ADD CONSTRAINT "ObservacionFacturador_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ObservacionFacturador_perfilId_estado_createdAt_idx" ON "ObservacionFacturador"("perfilId", "estado", "createdAt");
CREATE INDEX "ObservacionFacturador_autorId_createdAt_idx" ON "ObservacionFacturador"("autorId", "createdAt");
CREATE INDEX "ObservacionFacturador_transferencia_idx" ON "ObservacionFacturador"("transferencia");
