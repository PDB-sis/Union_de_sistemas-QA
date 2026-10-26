CREATE TYPE "TipoUbicacion" AS ENUM ('REGION', 'BODEGA', 'TIENDA');
CREATE TABLE "Ubicacion" (
  "id" UUID NOT NULL, "codigo" VARCHAR(80) NOT NULL, "nombre" VARCHAR(200) NOT NULL,
  "tipo" "TipoUbicacion" NOT NULL, "regionId" UUID,
  CONSTRAINT "Ubicacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Ubicacion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Ubicacion_region_forma" CHECK (("tipo" = 'REGION' AND "regionId" IS NULL) OR ("tipo" <> 'REGION' AND "regionId" IS NOT NULL))
);
CREATE UNIQUE INDEX "Ubicacion_codigo_key" ON "Ubicacion"("codigo");
CREATE INDEX "Ubicacion_regionId_idx" ON "Ubicacion"("regionId");
ALTER TABLE "Bodega" ADD COLUMN "ubicacionId" UUID;
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Bodega_ubicacionId_key" ON "Bodega"("ubicacionId");
CREATE TABLE "AsignacionAcceso" (
  "id" UUID NOT NULL, "usuarioId" UUID NOT NULL, "rol" "RolUsuario" NOT NULL, "ubicacionId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsignacionAcceso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AsignacionAcceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AsignacionAcceso_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AsignacionAcceso_usuarioId_idx" ON "AsignacionAcceso"("usuarioId");
CREATE UNIQUE INDEX "AsignacionAcceso_usuarioId_rol_ubicacionId_key" ON "AsignacionAcceso"("usuarioId", "rol", "ubicacionId");
CREATE UNIQUE INDEX "AsignacionAcceso_nacional_key" ON "AsignacionAcceso"("usuarioId", "rol") WHERE "ubicacionId" IS NULL;
-- Preservar únicamente administradores. Los otros roles requieren alcance explícito.
INSERT INTO "AsignacionAcceso" ("id", "usuarioId", "rol") SELECT gen_random_uuid(), "id", "rol" FROM "Usuario" WHERE "rol" = 'ADMINISTRADOR';

-- Jerarquía de dos niveles e identidades de ubicación inmutables.
CREATE FUNCTION pdmc_ubicacion_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."tipo" IS DISTINCT FROM OLD."tipo" OR NEW."regionId" IS DISTINCT FROM OLD."regionId") THEN
    RAISE EXCEPTION 'La jerarquía de una ubicación es inmutable';
  END IF;
  IF NEW."regionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ubicacion" WHERE id=NEW."regionId" AND tipo='REGION') THEN
    RAISE EXCEPTION 'La ubicación requiere una región válida';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Ubicacion_validar" BEFORE INSERT OR UPDATE ON "Ubicacion" FOR EACH ROW EXECUTE FUNCTION pdmc_ubicacion_validar();
CREATE FUNCTION pdmc_bodega_ubicacion_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."ubicacionId" IS NOT NULL AND NEW."ubicacionId" IS DISTINCT FROM OLD."ubicacionId" THEN
    RAISE EXCEPTION 'No se puede trasladar un expediente entre ubicaciones';
  END IF;
  IF NEW."ubicacionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ubicacion" WHERE id=NEW."ubicacionId" AND tipo IN ('BODEGA','TIENDA')) THEN
    RAISE EXCEPTION 'Destino inválido';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Bodega_ubicacion_validar" BEFORE INSERT OR UPDATE ON "Bodega" FOR EACH ROW EXECUTE FUNCTION pdmc_bodega_ubicacion_validar();
