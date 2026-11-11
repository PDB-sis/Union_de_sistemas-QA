-- Fase 2b-2: inventario, fotografías de negativos y negativos por bodega (cada región con lo suyo).
-- Solo agrega columnas e índices; no borra datos. Los datos que ya existen eran de un único sitio
-- (PDMC_INVENTARIO_DIM_ID): el servidor los asigna a esa bodega al iniciar (backend/src/inventario/sitios.ts).
-- DropIndex
DROP INDEX "FotoNegativos_fechaCorte_key";

-- DropIndex
DROP INDEX "InventarioActual_productoId_bodegaProductoId_key";

-- AlterTable
ALTER TABLE "ConsultaInventario" ADD COLUMN     "ubicacionId" UUID;

-- AlterTable
ALTER TABLE "FotoNegativos" ADD COLUMN     "ubicacionId" UUID;

-- AlterTable
ALTER TABLE "InventarioActual" ADD COLUMN     "ubicacionId" UUID;

-- CreateIndex
CREATE INDEX "ConsultaInventario_ubicacionId_fechaConsulta_idx" ON "ConsultaInventario"("ubicacionId", "fechaConsulta");

-- CreateIndex
CREATE UNIQUE INDEX "FotoNegativos_ubicacionId_fechaCorte_key" ON "FotoNegativos"("ubicacionId", "fechaCorte");

-- CreateIndex
CREATE INDEX "InventarioActual_ubicacionId_productoId_idx" ON "InventarioActual"("ubicacionId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioActual_ubicacionId_productoId_bodegaProductoId_key" ON "InventarioActual"("ubicacionId", "productoId", "bodegaProductoId");

-- AddForeignKey
ALTER TABLE "ConsultaInventario" ADD CONSTRAINT "ConsultaInventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoNegativos" ADD CONSTRAINT "FotoNegativos_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioActual" ADD CONSTRAINT "InventarioActual_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

