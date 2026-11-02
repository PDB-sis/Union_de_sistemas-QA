-- Momento en que PDMC vio la transferencia pasar a Exportada: ahí empiezan los 5 días hábiles
-- que tiene la tienda para reportarla. Se borra si vuelve a otro estado y se fija de nuevo al exportarse.
ALTER TABLE "TransferenciaConsulta" ADD COLUMN "exportadaEn" TIMESTAMPTZ(3);

-- Las que ya estaban exportadas no tienen fecha conocida: el plazo empieza al aplicar esta migración.
UPDATE "TransferenciaConsulta" SET "exportadaEn" = CURRENT_TIMESTAMP WHERE "estado" = 'Exportada' AND "bajaEn" IS NULL;
