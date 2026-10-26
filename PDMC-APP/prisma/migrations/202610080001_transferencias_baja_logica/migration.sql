-- Las transferencias que ya no aparecen en la consulta de origen se marcan
-- con bajaEn en lugar de borrarse; los listados las ocultan.
ALTER TABLE "TransferenciaConsulta" ADD COLUMN "bajaEn" TIMESTAMPTZ(3);
