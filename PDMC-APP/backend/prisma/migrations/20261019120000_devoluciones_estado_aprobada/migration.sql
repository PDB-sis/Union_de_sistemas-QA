-- SQL Server entrega devoluciones con Status = 1 ("Aprobada"), igual que en
-- transferencias. Antes una sola devolución aprobada rechazaba toda la carga.
ALTER TABLE "DevolucionConsulta" DROP CONSTRAINT "DevolucionConsulta_estado_check";
ALTER TABLE "DevolucionConsulta"
  ADD CONSTRAINT "DevolucionConsulta_estado_check" CHECK ("estado" IN ('Abierta','Aprobada','Exportada'));
