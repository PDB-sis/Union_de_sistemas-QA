CREATE TABLE "TransferenciaConsultaDetalle" (
  "id" UUID NOT NULL,
  "transferenciaId" UUID NOT NULL,
  "productoId" UUID,
  "codigoBarra" VARCHAR(128) NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "numeroCaja" VARCHAR(80) NOT NULL,
  CONSTRAINT "TransferenciaConsultaDetalle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferenciaConsultaDetalle_cantidad_check" CHECK ("cantidad" > 0),
  CONSTRAINT "TransferenciaConsultaDetalle_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaConsulta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaConsultaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TransferenciaConsultaDetalle_transferenciaId_codigoBarra_numeroCaja_key"
  ON "TransferenciaConsultaDetalle"("transferenciaId", "codigoBarra", "numeroCaja");
CREATE INDEX "TransferenciaConsultaDetalle_transferenciaId_numeroCaja_idx"
  ON "TransferenciaConsultaDetalle"("transferenciaId", "numeroCaja");
CREATE INDEX "TransferenciaConsultaDetalle_codigoBarra_idx"
  ON "TransferenciaConsultaDetalle"("codigoBarra");
CREATE INDEX "TransferenciaConsultaDetalle_productoId_idx"
  ON "TransferenciaConsultaDetalle"("productoId");
