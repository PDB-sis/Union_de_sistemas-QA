-- ============================================================
-- Restauración de emergencia de public.creacion desde un respaldo.
--
-- 1. Detener el worker (servicio) y n8n.
-- 2. Reemplazar creacion_AAAAMMDD_HHMI por la tabla del respaldo:
--      SELECT tabla_respaldo FROM respaldo.creacion_linea_base ORDER BY id DESC;
-- 3. Ejecutar:
--      psql ... -v respaldo=creacion_AAAAMMDD_HHMI -f scripts/99_restaurar_creacion.sql
--
-- Restaura solo las columnas que existían en el respaldo. Si la migración
-- 002 está aplicada, el TRUNCATE está bloqueado, por eso se usa DELETE.
-- Todo ocurre en una transacción: si algo falla, no cambia nada.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

LOCK TABLE public.creacion IN ACCESS EXCLUSIVE MODE;

DELETE FROM public.creacion;

SELECT format(
    'INSERT INTO public.creacion (%1$s) OVERRIDING SYSTEM VALUE SELECT %1$s FROM respaldo.%2$I',
    string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
    :'respaldo'
) AS sql_restaurar
FROM information_schema.columns
WHERE table_schema = 'respaldo'
  AND table_name = :'respaldo'
\gset

:sql_restaurar ;

-- Alinear la secuencia de registro_id con los datos restaurados.
SELECT setval(
    pg_get_serial_sequence('public.creacion', 'registro_id'),
    COALESCE((SELECT max(registro_id) FROM public.creacion), 1)
)
WHERE pg_get_serial_sequence('public.creacion', 'registro_id') IS NOT NULL;

SELECT count(*) AS filas_restauradas FROM public.creacion;

COMMIT;
