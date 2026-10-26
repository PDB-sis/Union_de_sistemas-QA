-- Identidad común de tiendas y bodegas: BODEGA_DATOS.tbDimTiendas.dimID_Tienda.
-- El Codigo corporativo puede repetirse entre sitios, por eso se guarda aparte
-- y no reemplaza a "codigo" (que sigue siendo el código único de PDMC).
ALTER TABLE "Ubicacion" ADD COLUMN "dimIdTienda" INTEGER;
ALTER TABLE "Ubicacion" ADD COLUMN "codigoCorporativo" VARCHAR(80);
CREATE UNIQUE INDEX "Ubicacion_dimIdTienda_key" ON "Ubicacion"("dimIdTienda");
ALTER TABLE "Ubicacion"
  ADD CONSTRAINT "Ubicacion_dimIdTienda_sitio_check"
  CHECK ("dimIdTienda" IS NULL OR tipo IN ('TIENDA', 'BODEGA'));
