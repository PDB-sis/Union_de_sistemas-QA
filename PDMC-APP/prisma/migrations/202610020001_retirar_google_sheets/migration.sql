BEGIN;

-- PDMC conserva los expedientes, pero deja de almacenar metadatos destinados
-- a importar o sincronizar filas con Google Sheets.
DROP TABLE IF EXISTS "BodegaInconsistencia";

ALTER TABLE "Inconsistencia"
  DROP COLUMN IF EXISTS "sheetRow",
  DROP COLUMN IF EXISTS "origen",
  DROP COLUMN IF EXISTS "syncStatus",
  DROP COLUMN IF EXISTS "syncError",
  DROP COLUMN IF EXISTS "syncedAt";

DROP TYPE IF EXISTS "OrigenInconsistencia";

COMMIT;
