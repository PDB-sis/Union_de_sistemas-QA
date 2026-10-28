ALTER TABLE "DevolucionConsulta"
  ALTER COLUMN "totalValor" DROP NOT NULL,
  ADD COLUMN "unidades" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cantidadCodigos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DevolucionConsulta"
  ADD CONSTRAINT "DevolucionConsulta_unidades_check" CHECK ("unidades" >= 0),
  ADD CONSTRAINT "DevolucionConsulta_codigos_check" CHECK ("cantidadCodigos" >= 0);

CREATE TABLE "DevolucionConsultaDetalle" (
  "id" UUID NOT NULL,
  "devolucionId" UUID NOT NULL,
  "productoId" UUID,
  "codigoBarra" VARCHAR(128) NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "numeroCaja" VARCHAR(80) NOT NULL,
  CONSTRAINT "DevolucionConsultaDetalle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevolucionConsultaDetalle_cantidad_check" CHECK ("cantidad" > 0),
  CONSTRAINT "DevolucionConsultaDetalle_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "DevolucionConsulta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DevolucionConsultaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DevolucionConsultaDetalle_devolucionId_codigoBarra_numeroCaja_key" ON "DevolucionConsultaDetalle"("devolucionId","codigoBarra","numeroCaja");
CREATE INDEX "DevolucionConsultaDetalle_devolucionId_numeroCaja_idx" ON "DevolucionConsultaDetalle"("devolucionId","numeroCaja");
CREATE INDEX "DevolucionConsultaDetalle_codigoBarra_idx" ON "DevolucionConsultaDetalle"("codigoBarra");
CREATE INDEX "DevolucionConsultaDetalle_productoId_idx" ON "DevolucionConsultaDetalle"("productoId");
