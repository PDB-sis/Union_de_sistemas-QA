-- ============================================================
-- Paso 1 del plan: respaldo de public.creacion ANTES de cualquier cambio.
--
-- Ejecutar en psql:
--   psql -h <host> -U <usuario> -d cysn_qa -f scripts/01_respaldo_creacion.sql
--
-- Crea respaldo.creacion_AAAAMMDD_HHMI (copia completa) y una línea base
-- de conteos y muestra en respaldo.creacion_linea_base.
-- Complementar con pg_dump (ver docs/SINCRONIZACION_CREACION.md).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE IF NOT EXISTS respaldo.creacion_linea_base (
    id               BIGSERIAL PRIMARY KEY,
    tabla_respaldo   TEXT        NOT NULL,
    tomado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_filas      BIGINT      NOT NULL,
    codigos_distintos BIGINT     NOT NULL,
    codigos_duplicados BIGINT    NOT NULL,
    max_registro_id  BIGINT,
    muestra_codigos  JSONB       NOT NULL
);

DO $$
DECLARE
    nombre TEXT := 'creacion_' || to_char(now(), 'YYYYMMDD_HH24MI');
BEGIN
    EXECUTE format(
        'CREATE TABLE respaldo.%I AS TABLE public.creacion',
        nombre
    );

    EXECUTE format(
        $q$
        INSERT INTO respaldo.creacion_linea_base
            (tabla_respaldo, total_filas, codigos_distintos,
             codigos_duplicados, max_registro_id, muestra_codigos)
        SELECT
            %L,
            (SELECT count(*) FROM respaldo.%I),
            (SELECT count(DISTINCT codigo_barra) FROM respaldo.%I),
            (SELECT count(*) FROM (
                SELECT codigo_barra FROM respaldo.%I
                GROUP BY codigo_barra HAVING count(*) > 1) d),
            (SELECT max(registro_id) FROM respaldo.%I),
            (SELECT COALESCE(jsonb_agg(m), '[]'::jsonb) FROM (
                SELECT codigo_barra, precio_detal_usd_mas_iva,
                       tasa_cambio, existencia
                FROM respaldo.%I
                ORDER BY md5(codigo_barra)
                LIMIT 50) m)
        $q$,
        nombre, nombre, nombre, nombre, nombre, nombre
    );

    RAISE NOTICE 'Respaldo creado: respaldo.%', nombre;
END;
$$;

SELECT * FROM respaldo.creacion_linea_base ORDER BY id DESC LIMIT 1;
