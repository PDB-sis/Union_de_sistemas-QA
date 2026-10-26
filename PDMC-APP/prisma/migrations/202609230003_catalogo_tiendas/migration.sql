BEGIN;

-- El catálogo fuente no contiene región. Las tiendas pueden quedar por clasificar
-- y la administración permite asignarlas posteriormente sin cambiar su identidad.
ALTER TABLE "Ubicacion" DROP CONSTRAINT IF EXISTS "Ubicacion_region_forma";
ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_region_forma"
  CHECK ("tipo" <> 'REGION' OR "regionId" IS NULL);
CREATE OR REPLACE FUNCTION pdmc_ubicacion_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."tipo" IS DISTINCT FROM OLD."tipo" THEN
    RAISE EXCEPTION 'El tipo de una ubicación es inmutable';
  END IF;
  IF NEW."regionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ubicacion" WHERE id=NEW."regionId" AND tipo='REGION') THEN
    RAISE EXCEPTION 'La ubicación requiere una región válida';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE "Tienda" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codigo" VARCHAR(80) NOT NULL,
  "nombre" VARCHAR(200) NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "ubicacionId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tienda_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Tienda_codigo_key" UNIQUE ("codigo"),
  CONSTRAINT "Tienda_ubicacionId_key" UNIQUE ("ubicacionId"),
  CONSTRAINT "Tienda_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Tienda_codigo_no_vacio" CHECK (length(btrim("codigo")) > 0),
  CONSTRAINT "Tienda_nombre_no_vacio" CHECK (length(btrim("nombre")) > 0)
);

CREATE INDEX "Tienda_activa_nombre_idx" ON "Tienda"("activa", "nombre");

INSERT INTO "Tienda" ("codigo", "nombre", "activa", "ubicacionId")
SELECT "codigo", "nombre", true, "id"
FROM "Ubicacion"
WHERE "tipo" = 'TIENDA';

COMMIT;
