CREATE TABLE "DevolucionConsultaImport" (
  "id" UUID NOT NULL,
  "nombreArchivo" VARCHAR(255) NOT NULL,
  "hashArchivo" VARCHAR(64) NOT NULL,
  "totalFilas" INTEGER NOT NULL,
  "resumen" JSONB NOT NULL,
  "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" UUID,
  CONSTRAINT "DevolucionConsultaImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevolucionConsultaImport_hashArchivo_key" UNIQUE ("hashArchivo"),
  CONSTRAINT "DevolucionConsultaImport_totalFilas_check" CHECK ("totalFilas" >= 0),
  CONSTRAINT "DevolucionConsultaImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DevolucionConsulta" (
  "id" UUID NOT NULL,
  "numero" VARCHAR(128) NOT NULL,
  "fecha" DATE NOT NULL,
  "codigoResponsable" VARCHAR(80) NOT NULL,
  "responsableId" UUID,
  "codigoTiendaConsulta" VARCHAR(250) NOT NULL,
  "tiendaId" UUID,
  "estado" VARCHAR(20) NOT NULL,
  "observacion" TEXT NOT NULL,
  "totalValor" DECIMAL(18,4) NOT NULL,
  "documentoOrigen" VARCHAR(128),
  "ultimaImportacionId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DevolucionConsulta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevolucionConsulta_numero_key" UNIQUE ("numero"),
  CONSTRAINT "DevolucionConsulta_estado_check" CHECK ("estado" IN ('Abierta','Exportada')),
  CONSTRAINT "DevolucionConsulta_totalValor_check" CHECK ("totalValor" >= 0),
  CONSTRAINT "DevolucionConsulta_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "PerfilLaboral"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DevolucionConsulta_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DevolucionConsulta_ultimaImportacionId_fkey" FOREIGN KEY ("ultimaImportacionId") REFERENCES "DevolucionConsultaImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DevolucionConsultaImport_importedAt_idx" ON "DevolucionConsultaImport"("importedAt");
CREATE INDEX "DevolucionConsulta_tiendaId_estado_fecha_idx" ON "DevolucionConsulta"("tiendaId","estado","fecha");
CREATE INDEX "DevolucionConsulta_responsableId_fecha_idx" ON "DevolucionConsulta"("responsableId","fecha");
CREATE INDEX "DevolucionConsulta_codigoResponsable_idx" ON "DevolucionConsulta"("codigoResponsable");
CREATE INDEX "DevolucionConsulta_codigoTiendaConsulta_idx" ON "DevolucionConsulta"("codigoTiendaConsulta");
CREATE INDEX "DevolucionConsulta_estado_fecha_idx" ON "DevolucionConsulta"("estado","fecha");
CREATE INDEX "DevolucionConsulta_ultimaImportacionId_idx" ON "DevolucionConsulta"("ultimaImportacionId");
