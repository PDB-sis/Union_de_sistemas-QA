-- ============================================================
-- 001 - Preparar public.creacion para la sincronización por diferencias
--
-- COMPATIBLE con n8n: puede aplicarse mientras n8n siga activo.
-- - Solo agrega columnas con DEFAULT y tablas nuevas.
-- - No modifica ni borra datos existentes.
-- - vigente = true por defecto, así las filas que n8n inserte siguen
--   siendo visibles para la comparación QA.
--
-- Aplicar ANTES de desplegar el backend que filtra por vigente = true.
-- Reversión: 001_creacion_sync_down.sql
-- ============================================================

BEGIN;

ALTER TABLE public.creacion
    ADD COLUMN IF NOT EXISTS hash_origen VARCHAR(64),
    ADD COLUMN IF NOT EXISTS sincronizado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vigente BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ultima_ejecucion_id BIGINT;

-- Acelera el LATERAL de la comparación QA y la sincronización.
CREATE INDEX IF NOT EXISTS ix_creacion_codigo_barra_vigente_reg
    ON public.creacion (codigo_barra, registro_id DESC)
    WHERE vigente;


CREATE TABLE IF NOT EXISTS public.sincronizacion_ejecucion (
    id                  BIGSERIAL PRIMARY KEY,
    proceso             VARCHAR(50)  NOT NULL,
    modo                VARCHAR(20)  NOT NULL
        CHECK (modo IN ('REAL', 'DRY_RUN')),
    estado              VARCHAR(20)  NOT NULL
        CHECK (estado IN ('EN_CURSO', 'EXITOSA', 'FALLIDA', 'ABORTADA')),
    iniciado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finalizado_en       TIMESTAMPTZ,
    duracion_ms         INTEGER,
    total_origen        INTEGER,
    total_validos       INTEGER,
    descartados         INTEGER,
    duplicados_origen   INTEGER,
    insertados          INTEGER,
    actualizados        INTEGER,
    sin_cambios         INTEGER,
    inactivados         INTEGER,
    intentos            INTEGER,
    error               TEXT,
    detalle             JSONB,
    host                VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_sincronizacion_ejecucion_proceso_id
    ON public.sincronizacion_ejecucion (proceso, id DESC);


CREATE TABLE IF NOT EXISTS public.sincronizacion_estado (
    proceso                     VARCHAR(50) PRIMARY KEY,
    ultima_ejecucion_id         BIGINT,
    ultimo_estado               VARCHAR(20),
    ultimo_modo                 VARCHAR(20),
    ultima_ejecucion_en         TIMESTAMPTZ,
    ultimo_exito_en             TIMESTAMPTZ,
    ultimo_exito_ejecucion_id   BIGINT,
    ultimo_error                TEXT,
    actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.sincronizacion_estado (proceso)
VALUES ('creacion')
ON CONFLICT (proceso) DO NOTHING;

COMMIT;
