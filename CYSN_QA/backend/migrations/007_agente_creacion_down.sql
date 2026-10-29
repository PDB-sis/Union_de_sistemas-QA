BEGIN;

-- No borra datos: si ya hay filas de la tarea creacion, la reversión se detiene.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM agente_fila WHERE tarea = 'creacion') THEN
        RAISE EXCEPTION 'Hay filas de la tarea creacion en agente_fila; revíselas antes de revertir la migración 007.';
    END IF;
END $$;

ALTER TABLE agente_fila DROP CONSTRAINT agente_fila_tarea_check;
ALTER TABLE agente_fila ADD CONSTRAINT agente_fila_tarea_check
    CHECK (tarea IN ('transferencias', 'devoluciones', 'usuarios'));

COMMIT;
