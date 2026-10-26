-- Conserva una copia auditable antes de retirar duplicados históricos.
WITH ranked AS (
  SELECT i.*, ROW_NUMBER() OVER (
    PARTITION BY i."tiendaId", i."transferencia", i."codigoBarra"
    ORDER BY i."createdAt", i."id"
  ) AS position
  FROM "Inconsistencia" i
  WHERE i."origen" = 'APP_TIENDA'
), backed_up AS (
  INSERT INTO "Auditoria" ("id","entidad","entidadId","accion","origen","motivo","valorAnterior","createdAt")
  SELECT gen_random_uuid(), 'Inconsistencia', ranked."id", 'DUPLICADO_RETIRADO', 'MIGRACION',
         'Código repetido en la misma transferencia; se conserva el primer reporte',
         to_jsonb(ranked) - 'position', CURRENT_TIMESTAMP
  FROM ranked WHERE position > 1
  RETURNING "entidadId"
)
DELETE FROM "Inconsistencia" target
USING backed_up
WHERE target."id" = backed_up."entidadId";

CREATE UNIQUE INDEX "Inconsistencia_tienda_transferencia_codigo_app_key"
ON "Inconsistencia"("tiendaId", "transferencia", "codigoBarra")
WHERE "origen" = 'APP_TIENDA';
