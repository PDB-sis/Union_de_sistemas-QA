-- Las devoluciones vuelven a traer su detalle por producto y caja (MOVDEVTRANSFERENCIAS),
-- como las transferencias. lineasDetalle guarda cuántas líneas tiene la devolución en SQL Server
-- para saber si el detalle recibido está completo. Solo agrega una columna: no cambia datos.
ALTER TABLE "DevolucionConsulta" ADD COLUMN "lineasDetalle" INTEGER;
ALTER TABLE "DevolucionConsulta" ADD CONSTRAINT "DevolucionConsulta_lineasDetalle_check" CHECK ("lineasDetalle" IS NULL OR "lineasDetalle" >= 0);
