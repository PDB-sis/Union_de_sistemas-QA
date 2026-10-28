CREATE TABLE "BodegaProducto" ("id" UUID NOT NULL, "nombre" VARCHAR(200) NOT NULL, CONSTRAINT "BodegaProducto_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "BodegaProducto_nombre_key" ON "BodegaProducto"("nombre");
INSERT INTO "BodegaProducto" (id,nombre) SELECT gen_random_uuid(),nombre FROM "Bodega" WHERE codigo <> 'PDMC_GENERAL' GROUP BY nombre;
ALTER TABLE "Negativo" ADD COLUMN "bodegaProductoId" UUID, ADD COLUMN "fusionadoEnId" UUID;
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_fusionadoEnId_fkey" FOREIGN KEY ("fusionadoEnId") REFERENCES "Negativo"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "BodegaInconsistencia" ("registroId" VARCHAR(64) NOT NULL, "bodegaProductoId" UUID, "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BodegaInconsistencia_pkey" PRIMARY KEY ("registroId"), CONSTRAINT "BodegaInconsistencia_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"(id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "UnificacionNegativos" ("id" UUID NOT NULL, "clave" VARCHAR(80) NOT NULL, "respaldo" JSONB NOT NULL, "resumen" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UnificacionNegativos_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "UnificacionNegativos_clave_key" ON "UnificacionNegativos"("clave");
-- Los dos lados se trasladan en una misma transacción; el commit comprueba la integridad.
ALTER TABLE "DetalleConsultaNegativos" ALTER CONSTRAINT "DetalleConsultaNegativos_consultaId_bodegaId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "DetalleConsultaNegativos" ALTER CONSTRAINT "DetalleConsultaNegativos_negativoId_bodegaId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
