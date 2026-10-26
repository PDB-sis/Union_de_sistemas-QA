BEGIN;

CREATE TABLE agente_sucursal (
    id BIGSERIAL PRIMARY KEY,
    sucursal_id BIGINT NOT NULL UNIQUE REFERENCES sucursal(id) ON DELETE RESTRICT,
    codigo VARCHAR(80) NOT NULL UNIQUE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_contacto_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventario_agente_actual (
    id BIGSERIAL PRIMARY KEY,
    sucursal_id BIGINT NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
    codigo_barra VARCHAR(100) NOT NULL,
    referencia VARCHAR(180), codigo_marca VARCHAR(100), concatenado VARCHAR(255),
    marca VARCHAR(180), descripcion TEXT, codigo_categoria VARCHAR(100), nombre_categoria VARCHAR(180),
    status VARCHAR(100), existencia NUMERIC(18,2), tasa_cambio NUMERIC(18,6), fecha_tasa_cambio TIMESTAMPTZ,
    precio_promocion NUMERIC(18,4), costo_inicial NUMERIC(18,4), costo_dolar NUMERIC(18,4),
    precio_detal_usd_mas_iva NUMERIC(18,4), precio_detal_mas_iva NUMERIC(18,4),
    precio_mayor_usd_mas_iva NUMERIC(18,4), precio_mayor_mas_iva NUMERIC(18,4),
    origen_actualizado_at TIMESTAMPTZ, activo BOOLEAN NOT NULL DEFAULT TRUE,
    fila_hash CHAR(64) NOT NULL, ultimo_snapshot_id UUID NULL,
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(sucursal_id, codigo_barra)
);
CREATE INDEX ix_inventario_agente_actual_sucursal_activo ON inventario_agente_actual(sucursal_id, activo);

CREATE TABLE inventario_agente_pendiente (
    sucursal_id BIGINT NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
    codigo_barra VARCHAR(100) NOT NULL,
    detectado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(sucursal_id, codigo_barra)
);

CREATE TABLE inventario_agente_lote (
    id BIGSERIAL PRIMARY KEY,
    agente_sucursal_id BIGINT NOT NULL REFERENCES agente_sucursal(id) ON DELETE RESTRICT,
    lote_id UUID NOT NULL,
    modo VARCHAR(20) NOT NULL CHECK (modo IN ('INCREMENTAL','INICIAL','RECONCILIACION')),
    filas_recibidas INTEGER NOT NULL CHECK (filas_recibidas > 0),
    cursor_origen TIMESTAMPTZ NULL, tasa_firma VARCHAR(128) NULL,
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agente_sucursal_id, lote_id)
);

COMMIT;