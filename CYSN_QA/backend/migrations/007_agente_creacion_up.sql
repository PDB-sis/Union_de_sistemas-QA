BEGIN;

-- Fase 4 de PLAN-agente-multisitio.md: el agente del PC de creación (sitio CREACION,
-- dimID 2010) envía la tarea "creacion", una fila por CodigoBarra, con las columnas
-- de app/sync/sql/creacion_origen.sql. El worker app.sync.creacion la procesa hacia
-- creacion con la misma limpieza y los mismos controles que antes.
ALTER TABLE agente_fila DROP CONSTRAINT agente_fila_tarea_check;
ALTER TABLE agente_fila ADD CONSTRAINT agente_fila_tarea_check
    CHECK (tarea IN ('transferencias', 'devoluciones', 'usuarios', 'creacion'));

COMMIT;
