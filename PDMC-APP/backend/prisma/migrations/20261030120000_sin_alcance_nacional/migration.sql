-- Regla: no existen cuentas operativas de alcance nacional. Cada rol trabaja sobre su
-- región, bodega o tienda, porque cada una tiene su propia consulta, inventario y datos.
-- Solo el Administrador (gestión del sistema, no operación) va sin ubicación.

-- Respaldo: cada asignación operativa sin ubicación queda en la auditoría antes de retirarse.
-- La persona conserva su cuenta; el administrador le asigna la región que corresponda.
INSERT INTO "Auditoria" ("id","usuarioId","entidadId","entidad","accion","origen","motivo","valorAnterior","valorNuevo","createdAt")
SELECT gen_random_uuid(), NULL, a."usuarioId", 'Usuario', 'RETIRAR_ALCANCE_NACIONAL', 'MIGRACION 20261030120000_sin_alcance_nacional',
  'Regla: no existen cuentas operativas de alcance nacional; asigne una región.',
  jsonb_build_object('id', a."id", 'rol', a."rol", 'ubicacionId', NULL, 'createdAt', a."createdAt", 'email', u."email"),
  NULL, NOW()
FROM "AsignacionAcceso" a JOIN "Usuario" u ON u."id" = a."usuarioId"
WHERE a."ubicacionId" IS NULL AND a."rol" <> 'ADMINISTRADOR';

DELETE FROM "AsignacionAcceso" WHERE "ubicacionId" IS NULL AND "rol" <> 'ADMINISTRADOR';

ALTER TABLE "AsignacionAcceso" ADD CONSTRAINT "AsignacionAcceso_sin_alcance_nacional"
  CHECK ("rol" = 'ADMINISTRADOR' OR "ubicacionId" IS NOT NULL);
