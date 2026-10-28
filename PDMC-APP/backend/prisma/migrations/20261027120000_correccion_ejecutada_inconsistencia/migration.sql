-- Toda corrección de una inconsistencia (envío, devolución, corrección de
-- transferencia o reubicación, además del ajuste) registra cuándo y quién la
-- ejecutó, para que pase por Verificación antes de cerrarse.
-- Solo agrega columnas: no modifica ni borra datos existentes.
ALTER TABLE "Inconsistencia" ADD COLUMN "correccionEjecutadaAt" TIMESTAMPTZ(3);
ALTER TABLE "Inconsistencia" ADD COLUMN "correccionEjecutadaPorId" UUID;
ALTER TABLE "Inconsistencia" ADD CONSTRAINT "Inconsistencia_correccionEjecutadaPorId_fkey"
  FOREIGN KEY ("correccionEjecutadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
