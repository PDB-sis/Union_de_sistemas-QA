BEGIN;
CREATE TABLE "MigracionLocalNegativos" (
  "id" UUID NOT NULL PRIMARY KEY,
  "hash" VARCHAR(64) NOT NULL,
  "datos" JSONB NOT NULL,
  "manifiesto" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verificadaAt" TIMESTAMPTZ(3),
  CONSTRAINT "Migracion_hash_valido" CHECK ("hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "MigracionLocalNegativos_hash_key" ON "MigracionLocalNegativos"("hash");
ALTER TABLE "Bodega" ADD COLUMN "migracionLocalId" UUID;
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_migracionLocalId_fkey" FOREIGN KEY ("migracionLocalId") REFERENCES "MigracionLocalNegativos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
