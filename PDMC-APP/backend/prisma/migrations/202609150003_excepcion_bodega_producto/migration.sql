CREATE TABLE "ExcepcionBodegaProducto" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "productoId" UUID NOT NULL,
  "bodegaProductoId" UUID NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ExcepcionBodegaProducto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExcepcionBodegaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExcepcionBodegaProducto_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExcepcionBodegaProducto_productoId_key" ON "ExcepcionBodegaProducto"("productoId");
CREATE INDEX "ExcepcionBodegaProducto_bodegaProductoId_idx" ON "ExcepcionBodegaProducto"("bodegaProductoId");
