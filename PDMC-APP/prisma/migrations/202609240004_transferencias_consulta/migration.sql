BEGIN;
CREATE TABLE "TransferenciaConsultaImport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "nombreArchivo" VARCHAR(255) NOT NULL,
  "hashArchivo" VARCHAR(64) NOT NULL, "totalFilas" INTEGER NOT NULL, "resumen" JSONB NOT NULL,
  "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "importedById" UUID,
  CONSTRAINT "TransferenciaConsultaImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferenciaConsultaImport_hashArchivo_key" UNIQUE ("hashArchivo"),
  CONSTRAINT "TransferenciaConsultaImport_totalFilas_check" CHECK ("totalFilas">=0),
  CONSTRAINT "TransferenciaConsultaImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "TransferenciaConsulta" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "numero" VARCHAR(128) NOT NULL,
  "fecha" DATE NOT NULL, "usuario" VARCHAR(200) NOT NULL, "destinoOriginal" VARCHAR(250) NOT NULL,
  "tiendaId" UUID, "estado" VARCHAR(20) NOT NULL, "observacion" TEXT, "unidades" INTEGER NOT NULL,
  "cantidadCodigos" INTEGER NOT NULL, "ultimaImportacionId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransferenciaConsulta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferenciaConsulta_numero_key" UNIQUE ("numero"),
  CONSTRAINT "TransferenciaConsulta_estado_check" CHECK ("estado" IN ('Abierta','Aprobada','Exportada')),
  CONSTRAINT "TransferenciaConsulta_unidades_check" CHECK ("unidades">=0),
  CONSTRAINT "TransferenciaConsulta_codigos_check" CHECK ("cantidadCodigos">=0),
  CONSTRAINT "TransferenciaConsulta_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaConsulta_ultimaImportacionId_fkey" FOREIGN KEY ("ultimaImportacionId") REFERENCES "TransferenciaConsultaImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TransferenciaConsultaImport_importedAt_idx" ON "TransferenciaConsultaImport"("importedAt");
CREATE INDEX "TransferenciaConsulta_tiendaId_estado_fecha_idx" ON "TransferenciaConsulta"("tiendaId","estado","fecha");
CREATE INDEX "TransferenciaConsulta_estado_fecha_idx" ON "TransferenciaConsulta"("estado","fecha");
CREATE INDEX "TransferenciaConsulta_ultimaImportacionId_idx" ON "TransferenciaConsulta"("ultimaImportacionId");
COMMIT;
