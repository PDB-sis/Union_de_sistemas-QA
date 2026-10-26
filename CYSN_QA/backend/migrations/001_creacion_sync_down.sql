-- ============================================================
-- Reversión de 001_creacion_sync_up.sql
--
-- Orden obligatorio:
--   1. Revertir 002 (002_creacion_corte_down.sql) si fue aplicada.
--   2. Desplegar el backend anterior (sin filtro vigente = true).
--   3. Ejecutar este script.
--
-- ATENCIÓN: elimina el historial de ejecuciones del worker.
-- Las filas con vigente = false (bajas lógicas) vuelven a ser visibles;
-- la comparación QA anterior toma el registro_id más reciente por código.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.sincronizacion_estado;
DROP TABLE IF EXISTS public.sincronizacion_ejecucion;

DROP INDEX IF EXISTS public.ix_creacion_codigo_barra_vigente_reg;

ALTER TABLE public.creacion
    DROP COLUMN IF EXISTS ultima_ejecucion_id,
    DROP COLUMN IF EXISTS vigente,
    DROP COLUMN IF EXISTS sincronizado_en,
    DROP COLUMN IF EXISTS hash_origen;

COMMIT;
