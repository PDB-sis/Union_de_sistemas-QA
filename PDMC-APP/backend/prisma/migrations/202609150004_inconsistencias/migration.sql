CREATE TABLE "Inconsistencia" (
  "id" UUID NOT NULL,
  "sourceKey" VARCHAR(64) NOT NULL,
  "sheetRow" INTEGER NOT NULL,
  "fecha" TIMESTAMPTZ(3),
  "sucursal" VARCHAR(250) NOT NULL,
  "chofer" VARCHAR(200),
  "transferencia" VARCHAR(128) NOT NULL,
  "codigoBarra" VARCHAR(128) NOT NULL,
  "referencia" VARCHAR(200),
  "tipoError" VARCHAR(120) NOT NULL,
  "cantidadErrada" INTEGER NOT NULL,
  "motivo" VARCHAR(300),
  "comentarioAdmin" TEXT,
  "formaCorreccion" VARCHAR(200),
  "numeroCorreccion" VARCHAR(100),
  "unidadesAjustadas" INTEGER NOT NULL DEFAULT 0,
  "unidadesSinResolver" INTEGER NOT NULL DEFAULT 0,
  "resuelto" BOOLEAN NOT NULL DEFAULT false,
  "claveUnica" VARCHAR(300),
  "ajustar" VARCHAR(30),
  "cantidadAjuste" INTEGER,
  "numeroAjuste" VARCHAR(128),
  "veredicto" VARCHAR(300),
  "ajustado" BOOLEAN NOT NULL DEFAULT false,
  "productoId" UUID,
  "bodegaProductoId" UUID,
  "actualizadoPorId" UUID,
  "usuarioPdmc" VARCHAR(254),
  "syncStatus" VARCHAR(30) NOT NULL DEFAULT 'SINCRONIZADO',
  "syncError" TEXT,
  "syncedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Inconsistencia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Inconsistencia_sourceKey_key" ON "Inconsistencia"("sourceKey");
CREATE UNIQUE INDEX "Inconsistencia_sheetRow_key" ON "Inconsistencia"("sheetRow");
CREATE INDEX "Inconsistencia_resuelto_updatedAt_idx" ON "Inconsistencia"("resuelto", "updatedAt");
CREATE INDEX "Inconsistencia_transferencia_idx" ON "Inconsistencia"("transferencia");
CREATE INDEX "Inconsistencia_codigoBarra_idx" ON "Inconsistencia"("codigoBarra");
CREATE INDEX "Inconsistencia_sucursal_idx" ON "Inconsistencia"("sucursal");
CREATE INDEX "Inconsistencia_bodegaProductoId_idx" ON "Inconsistencia"("bodegaProductoId");
ALTER TABLE "Inconsistencia" ADD CONSTRAINT "Inconsistencia_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inconsistencia" ADD CONSTRAINT "Inconsistencia_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inconsistencia" ADD CONSTRAINT "Inconsistencia_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
