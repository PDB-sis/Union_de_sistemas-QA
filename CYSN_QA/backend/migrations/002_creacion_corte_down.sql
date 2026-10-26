-- ============================================================
-- Reversión de 002_creacion_corte_up.sql
--
-- Permite volver a n8n (rollback del corte):
-- - quita el bloqueo de TRUNCATE y el índice único;
-- - reactiva exactamente los duplicados que la 002 había marcado.
--
-- Antes de reactivar n8n, detenga el worker app.sync.creacion.
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS creacion_bloquear_truncate ON public.creacion;
DROP FUNCTION IF EXISTS public.creacion_bloquear_truncate();

DROP INDEX IF EXISTS public.ux_creacion_codigo_barra_vigente;

UPDATE public.creacion AS C
SET vigente = TRUE
FROM public.creacion_corte_002 AS D
WHERE C.registro_id = D.registro_id;

DROP TABLE IF EXISTS public.creacion_corte_002;

COMMIT;
