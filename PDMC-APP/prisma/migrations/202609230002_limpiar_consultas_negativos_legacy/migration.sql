BEGIN;

-- El inventario vigente y su consulta son la fuente oficial de existencias.
-- El respaldo externo previo a esta migración conserva la estructura eliminada.
ALTER TABLE "HistorialNegativo" DROP CONSTRAINT IF EXISTS "HistorialNegativo_consultaId_fkey";
DROP INDEX IF EXISTS "HistorialNegativo_consultaId_idx";
ALTER TABLE "HistorialNegativo" DROP COLUMN IF EXISTS "consultaId";

ALTER TABLE "Bodega" DROP CONSTRAINT IF EXISTS "Bodega_migracionLocalId_fkey";
ALTER TABLE "Bodega" DROP COLUMN IF EXISTS "migracionLocalId";

DROP TABLE IF EXISTS "DetalleConsultaNegativos";
DROP TABLE IF EXISTS "ConsultaNegativos";
DROP TABLE IF EXISTS "MigracionLocalNegativos";
DROP TABLE IF EXISTS "UnificacionNegativos";

DROP TYPE IF EXISTS "OrigenConsulta";
DROP TYPE IF EXISTS "EstadoConsulta";

INSERT INTO "Auditoria" ("id", "entidad", "entidadId", "accion", "motivo", "valorAnterior", "valorNuevo", "createdAt")
VALUES (
  gen_random_uuid(),
  'Arquitectura',
  gen_random_uuid(),
  'RETIRAR_FLUJO_NEGATIVOS_LEGACY',
  'Limpieza autorizada: inventario y ConsultaInventario quedan como fuente de existencias de negativos',
  '{"tablas":["ConsultaNegativos","DetalleConsultaNegativos","MigracionLocalNegativos","UnificacionNegativos"]}'::jsonb,
  '{"fuente":"ConsultaInventario/InventarioActual","expedientes":"Negativo","historial":"HistorialNegativo"}'::jsonb,
  now()
);

COMMIT;
