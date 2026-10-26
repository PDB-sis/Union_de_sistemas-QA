BEGIN;

CREATE TYPE "EstadoTransferenciaOperativa" AS ENUM ('ABIERTA','APROBADA','EXPORTADA');

CREATE TABLE "TransferenciaOperativa" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "numero" VARCHAR(128) NOT NULL,
  "tiendaId" UUID NOT NULL,
  "facturadoraId" UUID,
  "facturadoraNombre" VARCHAR(200) NOT NULL,
  "estado" "EstadoTransferenciaOperativa" NOT NULL DEFAULT 'ABIERTA',
  "unidades" INTEGER NOT NULL,
  "observaciones" VARCHAR(1000),
  "fechaAprobacion" TIMESTAMPTZ(3),
  "fechaExportacion" TIMESTAMPTZ(3),
  "creadaPorId" UUID NOT NULL,
  "actualizadaPorId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransferenciaOperativa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferenciaOperativa_numero_key" UNIQUE ("numero"),
  CONSTRAINT "TransferenciaOperativa_unidades_positivas" CHECK ("unidades" > 0),
  CONSTRAINT "TransferenciaOperativa_version_positiva" CHECK ("version" > 0),
  CONSTRAINT "TransferenciaOperativa_fechas_estado" CHECK (
    ("estado"='ABIERTA' AND "fechaAprobacion" IS NULL AND "fechaExportacion" IS NULL) OR
    ("estado"='APROBADA' AND "fechaAprobacion" IS NOT NULL AND "fechaExportacion" IS NULL) OR
    ("estado"='EXPORTADA' AND "fechaAprobacion" IS NOT NULL AND "fechaExportacion" IS NOT NULL)
  ),
  CONSTRAINT "TransferenciaOperativa_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaOperativa_facturadoraId_fkey" FOREIGN KEY ("facturadoraId") REFERENCES "PerfilLaboral"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaOperativa_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaOperativa_actualizadaPorId_fkey" FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TransferenciaOperativaItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transferenciaId" UUID NOT NULL,
  "productoId" UUID NOT NULL,
  "cantidad" INTEGER NOT NULL,
  CONSTRAINT "TransferenciaOperativaItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferenciaOperativaItem_cantidad_positiva" CHECK ("cantidad" > 0),
  CONSTRAINT "TransferenciaOperativaItem_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaOperativa"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaOperativaItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TransferenciaOperativaItem_transferenciaId_productoId_key" ON "TransferenciaOperativaItem"("transferenciaId","productoId");
CREATE INDEX "TransferenciaOperativaItem_productoId_idx" ON "TransferenciaOperativaItem"("productoId");
CREATE INDEX "TransferenciaOperativa_tiendaId_estado_createdAt_idx" ON "TransferenciaOperativa"("tiendaId","estado","createdAt");
CREATE INDEX "TransferenciaOperativa_facturadoraId_createdAt_idx" ON "TransferenciaOperativa"("facturadoraId","createdAt");
CREATE INDEX "TransferenciaOperativa_estado_fechaExportacion_idx" ON "TransferenciaOperativa"("estado","fechaExportacion");

COMMIT;
