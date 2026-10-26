-- Una misma carga de inventario puede originar varios cortes de negativos
-- (p. ej. corte LUNES y JUEVES) cuando el inventario no cambió entre ventanas.
DROP INDEX "FotoNegativos_consultaId_key";
CREATE INDEX "FotoNegativos_consultaId_idx" ON "FotoNegativos"("consultaId");
