-- Las devoluciones que ya no aparecen en la consulta de SQL Server se marcan
-- con bajaEn en lugar de borrarse; los listados las ocultan.
ALTER TABLE "DevolucionConsulta" ADD COLUMN "bajaEn" TIMESTAMPTZ(3);

-- Índice declarado en el esquema para filtrar transferencias vigentes.
CREATE INDEX "TransferenciaConsulta_bajaEn_idx" ON "TransferenciaConsulta"("bajaEn");
