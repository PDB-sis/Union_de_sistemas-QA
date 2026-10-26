-- Conserva las cuentas existentes y las lleva al catálogo empresarial definitivo.
DELETE FROM "AsignacionAcceso" AS legado
WHERE legado.rol = 'ETIQUETADO'
  AND EXISTS (
    SELECT 1 FROM "AsignacionAcceso" AS vigente
    WHERE vigente."usuarioId" = legado."usuarioId"
      AND vigente.rol = 'RECEPCION_BODEGA'
      AND vigente."ubicacionId" IS NOT DISTINCT FROM legado."ubicacionId"
  );
UPDATE "AsignacionAcceso" SET rol = 'RECEPCION_BODEGA' WHERE rol = 'ETIQUETADO';
UPDATE "Usuario" SET rol = 'RECEPCION_BODEGA' WHERE rol = 'ETIQUETADO';
DELETE FROM "AsignacionAcceso" AS legado
WHERE legado.rol = 'SUPERVISOR'
  AND EXISTS (
    SELECT 1 FROM "AsignacionAcceso" AS vigente
    WHERE vigente."usuarioId" = legado."usuarioId"
      AND vigente.rol = 'CONSULTA_AUDITORIA'
      AND vigente."ubicacionId" IS NOT DISTINCT FROM legado."ubicacionId"
  );
UPDATE "AsignacionAcceso" SET rol = 'CONSULTA_AUDITORIA' WHERE rol = 'SUPERVISOR';
UPDATE "Usuario" SET rol = 'CONSULTA_AUDITORIA' WHERE rol = 'SUPERVISOR';

ALTER TYPE "RolUsuario" RENAME VALUE 'RECEPCION_BODEGA' TO 'RECEPCION';
ALTER TYPE "RolUsuario" RENAME VALUE 'CONSULTA_AUDITORIA' TO 'AUDITORIA';

ALTER TABLE "Usuario" ALTER COLUMN rol DROP DEFAULT;
CREATE TYPE "RolUsuario_nuevo" AS ENUM (
  'ADMINISTRADOR',
  'MEJORA_CONTINUA',
  'TIENDA',
  'JEFE_BODEGA',
  'RECTIFICACION',
  'RECEPCION',
  'AUDITORIA',
  'FACTURACION'
);

ALTER TABLE "Usuario"
  ALTER COLUMN rol TYPE "RolUsuario_nuevo"
  USING (rol::text::"RolUsuario_nuevo");
ALTER TABLE "AsignacionAcceso"
  ALTER COLUMN rol TYPE "RolUsuario_nuevo"
  USING (rol::text::"RolUsuario_nuevo");

DROP TYPE "RolUsuario";
ALTER TYPE "RolUsuario_nuevo" RENAME TO "RolUsuario";
ALTER TABLE "Usuario" ALTER COLUMN rol SET DEFAULT 'AUDITORIA';
