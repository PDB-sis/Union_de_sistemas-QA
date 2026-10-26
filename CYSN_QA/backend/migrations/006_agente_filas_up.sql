BEGIN;

-- Recepción en bruto de las tareas de PDMC que envían los agentes de bodega
-- (fase 3 de PLAN-agente-multisitio.md). Una fila por sitio, tarea y clave:
--   transferencias: Numero + CodigoBarra + NumeroCaja
--   devoluciones:   Numero
--   usuarios:       CodUsuario
-- "datos" guarda las columnas de la consulta tal cual (texto), para que PDMC
-- las procese con sus propios importadores. Nunca se borra: las filas que
-- desaparecen del origen quedan con activo = FALSE.
CREATE TABLE agente_fila (
    id BIGSERIAL PRIMARY KEY,
    dim_id_tienda INTEGER NOT NULL,
    tarea VARCHAR(30) NOT NULL CHECK (tarea IN ('transferencias', 'devoluciones', 'usuarios')),
    clave VARCHAR(400) NOT NULL,
    datos JSONB NOT NULL,
    fila_hash CHAR(64) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_snapshot_id UUID NULL,
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_agente_fila_sitio_tarea_clave UNIQUE (dim_id_tienda, tarea, clave)
);
CREATE INDEX ix_agente_fila_sitio_tarea_activo ON agente_fila(dim_id_tienda, tarea, activo);

CREATE TABLE agente_fila_lote (
    id BIGSERIAL PRIMARY KEY,
    agente_sucursal_id BIGINT NOT NULL REFERENCES agente_sucursal(id) ON DELETE RESTRICT,
    tarea VARCHAR(30) NOT NULL,
    lote_id UUID NOT NULL,
    modo VARCHAR(20) NOT NULL CHECK (modo IN ('INCREMENTAL', 'INICIAL', 'RECONCILIACION')),
    filas_recibidas INTEGER NOT NULL CHECK (filas_recibidas > 0),
    recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_agente_fila_lote UNIQUE (agente_sucursal_id, lote_id)
);

COMMIT;
