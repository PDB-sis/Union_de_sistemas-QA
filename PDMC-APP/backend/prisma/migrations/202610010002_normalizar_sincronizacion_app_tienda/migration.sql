-- Los reportes creados directamente en PDMC no dependen de Google Sheets.
UPDATE "Inconsistencia"
SET "syncStatus" = 'NO_APLICA',
    "syncError" = NULL
WHERE "origen" = 'APP_TIENDA'
  AND ("syncStatus" <> 'NO_APLICA' OR "syncError" IS NOT NULL);