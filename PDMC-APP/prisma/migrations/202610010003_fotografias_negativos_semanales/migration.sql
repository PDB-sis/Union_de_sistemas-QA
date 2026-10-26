CREATE TABLE "FotoNegativos" (
  "id" UUID NOT NULL,
  "consultaId" UUID NOT NULL,
  "fechaCorte" DATE NOT NULL,
  "tipoCorte" VARCHAR(20) NOT NULL,
  "totalCodigos" INTEGER NOT NULL,
  "totalUnidades" DECIMAL(18,4) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FotoNegativos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FotoNegativoItem" (
  "id" UUID NOT NULL,
  "fotoId" UUID NOT NULL,
  "productoId" UUID NOT NULL,
  "existencia" DECIMAL(18,4) NOT NULL,
  CONSTRAINT "FotoNegativoItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FotoNegativos_consultaId_key" ON "FotoNegativos"("consultaId");
CREATE INDEX "FotoNegativos_fechaCorte_idx" ON "FotoNegativos"("fechaCorte");
CREATE UNIQUE INDEX "FotoNegativoItem_fotoId_productoId_key" ON "FotoNegativoItem"("fotoId", "productoId");
CREATE INDEX "FotoNegativoItem_productoId_idx" ON "FotoNegativoItem"("productoId");
ALTER TABLE "FotoNegativos" ADD CONSTRAINT "FotoNegativos_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "ConsultaInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FotoNegativoItem" ADD CONSTRAINT "FotoNegativoItem_fotoId_fkey" FOREIGN KEY ("fotoId") REFERENCES "FotoNegativos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FotoNegativoItem" ADD CONSTRAINT "FotoNegativoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conserva el inventario negativo vigente como fotografía inicial para no perder el punto de partida.
WITH ultima AS (
  SELECT "id", "fechaConsulta" FROM "ConsultaInventario"
  ORDER BY "fechaConsulta" DESC, "fechaImportacion" DESC LIMIT 1
), totales AS (
  SELECT ia."productoId", SUM(ia."existencia") AS existencia
  FROM "InventarioActual" ia GROUP BY ia."productoId" HAVING SUM(ia."existencia") < 0
), foto AS (
  INSERT INTO "FotoNegativos" ("id", "consultaId", "fechaCorte", "tipoCorte", "totalCodigos", "totalUnidades")
  SELECT gen_random_uuid(), u."id", u."fechaConsulta"::date, 'INICIAL', COUNT(t."productoId")::int, ABS(COALESCE(SUM(t.existencia),0))
  FROM ultima u LEFT JOIN totales t ON TRUE GROUP BY u."id",u."fechaConsulta"
  RETURNING "id"
)
INSERT INTO "FotoNegativoItem" ("id", "fotoId", "productoId", "existencia")
SELECT gen_random_uuid(), f."id", t."productoId", t.existencia FROM foto f CROSS JOIN totales t;