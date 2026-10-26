BEGIN;

-- Solo es reversible si todos los agentes e inventarios tienen sucursal (no hay bodegas).
DELETE FROM inventario_agente_actual WHERE sucursal_id IS NULL;
DROP INDEX IF EXISTS ix_inventario_agente_actual_dim_activo;
ALTER TABLE inventario_agente_actual DROP CONSTRAINT IF EXISTS ck_inventario_agente_actual_sitio;
ALTER TABLE inventario_agente_actual DROP CONSTRAINT IF EXISTS uq_inventario_agente_actual_dim_codigo;
ALTER TABLE inventario_agente_actual DROP COLUMN IF EXISTS linea;
ALTER TABLE inventario_agente_actual DROP COLUMN IF EXISTS dim_id_tienda;
ALTER TABLE inventario_agente_actual ALTER COLUMN sucursal_id SET NOT NULL;

DELETE FROM inventario_agente_lote l USING agente_sucursal a WHERE a.id = l.agente_sucursal_id AND a.sucursal_id IS NULL;
DELETE FROM agente_sucursal WHERE sucursal_id IS NULL;
ALTER TABLE agente_sucursal DROP CONSTRAINT IF EXISTS ck_agente_sucursal_sitio;
ALTER TABLE agente_sucursal DROP CONSTRAINT IF EXISTS uq_agente_sucursal_dim_id_tienda;
ALTER TABLE agente_sucursal DROP COLUMN IF EXISTS dim_id_tienda;
ALTER TABLE agente_sucursal ALTER COLUMN sucursal_id SET NOT NULL;

COMMIT;
