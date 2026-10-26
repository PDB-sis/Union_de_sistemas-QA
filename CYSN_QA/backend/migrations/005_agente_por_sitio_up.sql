BEGIN;

-- El agente y su inventario pertenecen a un sitio (dimID_Tienda de BODEGA_DATOS):
-- una tienda (que además es sucursal de CYSN) o una bodega (que no lo es).

ALTER TABLE agente_sucursal ALTER COLUMN sucursal_id DROP NOT NULL;
ALTER TABLE agente_sucursal ADD COLUMN dim_id_tienda INTEGER NULL;
ALTER TABLE agente_sucursal ADD CONSTRAINT uq_agente_sucursal_dim_id_tienda UNIQUE (dim_id_tienda);
ALTER TABLE agente_sucursal ADD CONSTRAINT ck_agente_sucursal_sitio
    CHECK (sucursal_id IS NOT NULL OR dim_id_tienda IS NOT NULL);
UPDATE agente_sucursal a SET dim_id_tienda = s.dim_id_tienda
FROM sucursal s WHERE s.id = a.sucursal_id AND s.dim_id_tienda IS NOT NULL;

ALTER TABLE inventario_agente_actual ALTER COLUMN sucursal_id DROP NOT NULL;
ALTER TABLE inventario_agente_actual ADD COLUMN dim_id_tienda INTEGER NULL;
-- Categoría padre (LEFT(Codigo, 4)), que PDMC usa como línea.
ALTER TABLE inventario_agente_actual ADD COLUMN linea VARCHAR(180) NULL;
ALTER TABLE inventario_agente_actual ADD CONSTRAINT uq_inventario_agente_actual_dim_codigo UNIQUE (dim_id_tienda, codigo_barra);
ALTER TABLE inventario_agente_actual ADD CONSTRAINT ck_inventario_agente_actual_sitio
    CHECK (sucursal_id IS NOT NULL OR dim_id_tienda IS NOT NULL);
CREATE INDEX ix_inventario_agente_actual_dim_activo ON inventario_agente_actual(dim_id_tienda, activo);
UPDATE inventario_agente_actual i SET dim_id_tienda = s.dim_id_tienda
FROM sucursal s WHERE s.id = i.sucursal_id AND s.dim_id_tienda IS NOT NULL;

COMMIT;
