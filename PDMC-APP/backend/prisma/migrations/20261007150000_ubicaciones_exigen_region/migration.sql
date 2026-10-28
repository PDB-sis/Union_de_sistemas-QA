-- Conserva ubicaciones históricas pendientes de clasificar, pero impide crear
-- o actualizar tiendas y bodegas sin una región desde este punto.
ALTER TABLE "Ubicacion"
  ADD CONSTRAINT "Ubicacion_region_obligatoria_check"
  CHECK (
    (tipo = 'REGION' AND "regionId" IS NULL)
    OR
    (tipo IN ('TIENDA', 'BODEGA') AND "regionId" IS NOT NULL)
  ) NOT VALID;
