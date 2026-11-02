-- Una sola cuenta de sincronización por región.
CREATE UNIQUE INDEX "AsignacionAcceso_sincronizacion_region_key"
  ON "AsignacionAcceso" ("ubicacionId") WHERE "rol" = 'SINCRONIZACION';
