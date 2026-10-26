-- ============================================================
-- 002 - Corte: una sola fila vigente por código y bloqueo de TRUNCATE
--
-- APLICAR SOLO CON n8n DETENIDO (paso 8.4 del plan).
-- Después de esta migración, el TRUNCATE que ejecuta n8n falla a
-- propósito: así n8n no puede vaciar public.creacion por accidente.
--
-- - Duplicados de codigo_barra: se conserva vigente el registro_id más
--   reciente (el mismo que ya usaba la comparación QA). Los demás pasan
--   a vigente = false; NO se borra ninguna fila.
-- - Los registro_id afectados se guardan en creacion_corte_002 para
--   poder revertir con exactitud.
--
-- Reversión: 002_creacion_corte_down.sql
-- ============================================================

BEGIN;

-- Evita escrituras concurrentes durante el corte (las lecturas continúan).
LOCK TABLE public.creacion IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.creacion_corte_002 (
    registro_id   BIGINT PRIMARY KEY,
    codigo_barra  TEXT,
    marcado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

WITH ranking AS (
    SELECT
        registro_id,
        codigo_barra,
        ROW_NUMBER() OVER (
            PARTITION BY codigo_barra
            ORDER BY registro_id DESC
        ) AS rn
    FROM public.creacion
    WHERE vigente
      AND codigo_barra IS NOT NULL
),
duplicados AS (
    INSERT INTO public.creacion_corte_002 (registro_id, codigo_barra)
    SELECT registro_id, codigo_barra
    FROM ranking
    WHERE rn > 1
    ON CONFLICT (registro_id) DO NOTHING
    RETURNING registro_id
)
UPDATE public.creacion AS C
SET vigente = FALSE,
    sincronizado_en = now()
FROM duplicados AS D
WHERE C.registro_id = D.registro_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_creacion_codigo_barra_vigente
    ON public.creacion (codigo_barra)
    WHERE vigente;


CREATE OR REPLACE FUNCTION public.creacion_bloquear_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'TRUNCATE sobre public.creacion está bloqueado: la tabla la mantiene '
        'el worker app.sync.creacion mediante sincronización por diferencias '
        '(migración 002). Si n8n sigue activo, deténgalo.';
END;
$$;

DROP TRIGGER IF EXISTS creacion_bloquear_truncate ON public.creacion;

CREATE TRIGGER creacion_bloquear_truncate
    BEFORE TRUNCATE ON public.creacion
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.creacion_bloquear_truncate();

COMMIT;

-- Verificación (debe devolver 0 filas):
-- SELECT codigo_barra, count(*) FROM public.creacion
-- WHERE vigente GROUP BY codigo_barra HAVING count(*) > 1;
