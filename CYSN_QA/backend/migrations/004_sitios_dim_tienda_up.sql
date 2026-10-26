BEGIN;

-- Identidad común de tiendas y bodegas con PDMC y los agentes:
-- BODEGA_DATOS.tbDimTiendas.dimID_Tienda.
ALTER TABLE sucursal ADD COLUMN dim_id_tienda INTEGER NULL;
ALTER TABLE sucursal ADD CONSTRAINT uq_sucursal_dim_id_tienda UNIQUE (dim_id_tienda);

COMMIT;
