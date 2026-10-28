CREATE TYPE "EstadoPedidoTienda" AS ENUM (
  'ENVIADO', 'EN_REVISION', 'APROBADO', 'APROBADO_PARCIAL',
  'EN_PREPARACION', 'DESPACHADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'
);

CREATE TABLE "PedidoTienda" (
  "id" UUID NOT NULL,
  "codigo" VARCHAR(40) NOT NULL,
  "tiendaId" UUID NOT NULL,
  "solicitadoPorId" UUID NOT NULL,
  "estado" "EstadoPedidoTienda" NOT NULL DEFAULT 'ENVIADO',
  "observaciones" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PedidoTienda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoTiendaItem" (
  "id" UUID NOT NULL,
  "pedidoId" UUID NOT NULL,
  "productoId" UUID NOT NULL,
  "cantidadSolicitada" INTEGER NOT NULL,
  CONSTRAINT "PedidoTiendaItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PedidoTienda_codigo_key" ON "PedidoTienda"("codigo");
CREATE INDEX "PedidoTienda_tiendaId_createdAt_idx" ON "PedidoTienda"("tiendaId", "createdAt");
CREATE INDEX "PedidoTienda_estado_createdAt_idx" ON "PedidoTienda"("estado", "createdAt");
CREATE INDEX "PedidoTienda_solicitadoPorId_createdAt_idx" ON "PedidoTienda"("solicitadoPorId", "createdAt");
CREATE UNIQUE INDEX "PedidoTiendaItem_pedidoId_productoId_key" ON "PedidoTiendaItem"("pedidoId", "productoId");
CREATE INDEX "PedidoTiendaItem_productoId_idx" ON "PedidoTiendaItem"("productoId");

ALTER TABLE "PedidoTienda" ADD CONSTRAINT "PedidoTienda_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoTienda" ADD CONSTRAINT "PedidoTienda_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoTiendaItem" ADD CONSTRAINT "PedidoTiendaItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoTienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoTiendaItem" ADD CONSTRAINT "PedidoTiendaItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PedidoTiendaItem" ADD CONSTRAINT "PedidoTiendaItem_cantidad_positiva" CHECK ("cantidadSolicitada" > 0);

CREATE INDEX "Producto_linea_marca_activo_idx" ON "Producto"("linea", "marca", "activo");
CREATE INDEX "Producto_marca_activo_idx" ON "Producto"("marca", "activo");
