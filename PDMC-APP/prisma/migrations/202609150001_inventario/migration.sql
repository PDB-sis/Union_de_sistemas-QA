CREATE TABLE "ConsultaInventario" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuarioId" UUID NOT NULL,
  "nombreArchivo" VARCHAR(255) NOT NULL,
  "fechaConsulta" TIMESTAMPTZ(3) NOT NULL,
  "fechaImportacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hashArchivo" VARCHAR(64) NOT NULL,
  "totalFilas" INTEGER NOT NULL,
  CONSTRAINT "ConsultaInventario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsultaInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsultaInventario_hashArchivo_key" ON "ConsultaInventario"("hashArchivo");
CREATE INDEX "ConsultaInventario_fechaConsulta_fechaImportacion_idx" ON "ConsultaInventario"("fechaConsulta", "fechaImportacion");

CREATE TABLE "InventarioActual" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "consultaId" UUID NOT NULL,
  "productoId" UUID NOT NULL,
  "bodegaProductoId" UUID NOT NULL,
  "existencia" DECIMAL(18,4) NOT NULL,
  "activo" BOOLEAN NOT NULL,
  "categoria" VARCHAR(200),
  "subcategoria" VARCHAR(200),
  CONSTRAINT "InventarioActual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventarioActual_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "ConsultaInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventarioActual_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventarioActual_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES "BodegaProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventarioActual_productoId_bodegaProductoId_key" ON "InventarioActual"("productoId", "bodegaProductoId");
CREATE INDEX "InventarioActual_productoId_idx" ON "InventarioActual"("productoId");
CREATE INDEX "InventarioActual_bodegaProductoId_idx" ON "InventarioActual"("bodegaProductoId");
