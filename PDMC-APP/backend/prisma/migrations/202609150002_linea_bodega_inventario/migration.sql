ALTER TABLE "InventarioActual" ALTER COLUMN "bodegaProductoId" DROP NOT NULL;

CREATE TABLE "LineaInventario" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linea" VARCHAR(200) NOT NULL,
  "bodegaProductoId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LineaInventario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LineaInventario_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LineaInventario_linea_key" ON "LineaInventario"("linea");

-- Conserva como asignación inicial cualquier relación ya importada.
INSERT INTO "LineaInventario" ("linea","bodegaProductoId","updatedAt")
SELECT DISTINCT "subcategoria", "bodegaProductoId", CURRENT_TIMESTAMP
FROM "InventarioActual"
WHERE "subcategoria" IS NOT NULL
ON CONFLICT ("linea") DO NOTHING;
