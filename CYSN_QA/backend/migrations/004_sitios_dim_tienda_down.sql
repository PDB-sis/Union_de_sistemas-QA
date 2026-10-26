BEGIN;

ALTER TABLE sucursal DROP CONSTRAINT IF EXISTS uq_sucursal_dim_id_tienda;
ALTER TABLE sucursal DROP COLUMN IF EXISTS dim_id_tienda;

COMMIT;
