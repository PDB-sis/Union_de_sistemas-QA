ALTER TABLE "TransferenciaConsulta" ADD COLUMN "codigoFacturador" VARCHAR(80);
ALTER TABLE "TransferenciaConsulta" ADD COLUMN "facturadorId" UUID;

UPDATE "TransferenciaConsulta" t
SET "codigoFacturador" = upper(trim(t.usuario)),
    "facturadorId" = p.id
FROM "PerfilLaboral" p
WHERE p.tipo = 'FACTURACION'
  AND (upper(trim(p.codigo)) = upper(trim(t.usuario)) OR upper(trim(p.nombre)) = upper(trim(t.usuario)));

UPDATE "TransferenciaConsulta"
SET "codigoFacturador" = upper(trim(usuario))
WHERE "codigoFacturador" IS NULL;

ALTER TABLE "TransferenciaConsulta" ALTER COLUMN "codigoFacturador" SET NOT NULL;
ALTER TABLE "TransferenciaConsulta" DROP COLUMN usuario;
ALTER TABLE "TransferenciaConsulta" ADD CONSTRAINT "TransferenciaConsulta_facturadorId_fkey" FOREIGN KEY ("facturadorId") REFERENCES "PerfilLaboral"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TransferenciaConsulta_facturadorId_fecha_idx" ON "TransferenciaConsulta"("facturadorId", fecha);
CREATE INDEX "TransferenciaConsulta_codigoFacturador_idx" ON "TransferenciaConsulta"("codigoFacturador");