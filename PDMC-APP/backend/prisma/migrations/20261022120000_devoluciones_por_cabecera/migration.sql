-- La consulta de devoluciones pasa a una fila por devolución (sin detalle por
-- producto y caja) con TotalValor y DocumentoOrigen. Se guarda además el nombre
-- del usuario que la registró, para mostrarlo aunque su código no esté
-- vinculado con un facturador. El detalle ya importado se conserva.
ALTER TABLE "DevolucionConsulta" ADD COLUMN "nombreResponsable" VARCHAR(200);
