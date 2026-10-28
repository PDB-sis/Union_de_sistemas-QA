BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstadoNegativo" AS ENUM ('Nuevo', 'En investigación', 'Esperando conteo físico', 'Esperando decisión', 'Ajuste autorizado', 'Ajuste realizado', 'Pendiente de verificar', 'Cerrado sin ajuste', 'Solucionado', 'Reabierto');

-- CreateEnum
CREATE TYPE "OrigenConsulta" AS ENUM ('CSV', 'TXT', 'SQL_SERVER', 'MIGRACION');

-- CreateEnum
CREATE TYPE "EstadoConsulta" AS ENUM ('APLICADA', 'REVERTIDA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bodega" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" UUID NOT NULL,
    "codigoBarra" VARCHAR(128) NOT NULL,
    "referencia" VARCHAR(200),
    "descripcion" TEXT,
    "marca" VARCHAR(200),
    "codigoMarca" VARCHAR(80),
    "talla" VARCHAR(80),
    "categoria" VARCHAR(200),
    "linea" VARCHAR(200),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaNegativos" (
    "id" UUID NOT NULL,
    "bodegaId" UUID NOT NULL,
    "usuarioId" UUID,
    "origen" "OrigenConsulta" NOT NULL,
    "estado" "EstadoConsulta" NOT NULL DEFAULT 'APLICADA',
    "nombreArchivo" VARCHAR(255),
    "fechaConsulta" TIMESTAMPTZ(3) NOT NULL,
    "fechaImportacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claveIdempotencia" VARCHAR(128) NOT NULL,
    "hashArchivo" VARCHAR(64),
    "resumen" JSONB,
    "revertidaAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConsultaNegativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negativo" (
    "id" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "bodegaId" UUID NOT NULL,
    "responsableId" UUID,
    "estado" "EstadoNegativo" NOT NULL DEFAULT 'Nuevo',
    "conteoFisico" DECIMAL(18,4),
    "motivo" TEXT,
    "documentoRelacionado" VARCHAR(255),
    "veredicto" TEXT,
    "numeroAjuste" VARCHAR(128),
    "observaciones" TEXT,
    "primeraDeteccion" TIMESTAMPTZ(3) NOT NULL,
    "ultimaDeteccion" TIMESTAMPTZ(3) NOT NULL,
    "anuladoAt" TIMESTAMPTZ(3),
    "motivoAnulacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Negativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleConsultaNegativos" (
    "id" UUID NOT NULL,
    "consultaId" UUID NOT NULL,
    "negativoId" UUID NOT NULL,
    "bodegaId" UUID NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "existencia" DECIMAL(18,4) NOT NULL,
    "datosOriginales" JSONB NOT NULL,

    CONSTRAINT "DetalleConsultaNegativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialNegativo" (
    "id" UUID NOT NULL,
    "negativoId" UUID NOT NULL,
    "usuarioId" UUID,
    "consultaId" UUID,
    "accion" VARCHAR(80) NOT NULL,
    "motivo" TEXT NOT NULL,
    "valorAnterior" JSONB,
    "valorNuevo" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialNegativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "entidad" VARCHAR(80) NOT NULL,
    "entidadId" UUID NOT NULL,
    "accion" VARCHAR(80) NOT NULL,
    "motivo" TEXT NOT NULL,
    "valorAnterior" JSONB,
    "valorNuevo" JSONB,
    "correlacionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_codigo_key" ON "Bodega"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigoBarra_key" ON "Producto"("codigoBarra");

-- CreateIndex
CREATE INDEX "Producto_referencia_idx" ON "Producto"("referencia");

-- CreateIndex
CREATE INDEX "ConsultaNegativos_bodegaId_estado_fechaConsulta_fechaImport_idx" ON "ConsultaNegativos"("bodegaId", "estado", "fechaConsulta", "fechaImportacion");

-- CreateIndex
CREATE INDEX "ConsultaNegativos_usuarioId_idx" ON "ConsultaNegativos"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultaNegativos_bodegaId_claveIdempotencia_key" ON "ConsultaNegativos"("bodegaId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultaNegativos_id_bodegaId_key" ON "ConsultaNegativos"("id", "bodegaId");

-- CreateIndex
CREATE INDEX "Negativo_bodegaId_anuladoAt_estado_idx" ON "Negativo"("bodegaId", "anuladoAt", "estado");

-- CreateIndex
CREATE INDEX "Negativo_responsableId_estado_idx" ON "Negativo"("responsableId", "estado");

-- CreateIndex
CREATE INDEX "Negativo_ultimaDeteccion_idx" ON "Negativo"("ultimaDeteccion");

-- CreateIndex
CREATE UNIQUE INDEX "Negativo_productoId_bodegaId_key" ON "Negativo"("productoId", "bodegaId");

-- CreateIndex
CREATE UNIQUE INDEX "Negativo_id_bodegaId_key" ON "Negativo"("id", "bodegaId");

-- CreateIndex
CREATE INDEX "DetalleConsultaNegativos_negativoId_consultaId_idx" ON "DetalleConsultaNegativos"("negativoId", "consultaId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleConsultaNegativos_consultaId_negativoId_key" ON "DetalleConsultaNegativos"("consultaId", "negativoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleConsultaNegativos_consultaId_numeroFila_key" ON "DetalleConsultaNegativos"("consultaId", "numeroFila");

-- CreateIndex
CREATE INDEX "HistorialNegativo_negativoId_createdAt_idx" ON "HistorialNegativo"("negativoId", "createdAt");

-- CreateIndex
CREATE INDEX "HistorialNegativo_consultaId_idx" ON "HistorialNegativo"("consultaId");

-- CreateIndex
CREATE INDEX "HistorialNegativo_usuarioId_idx" ON "HistorialNegativo"("usuarioId");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_createdAt_idx" ON "Auditoria"("entidad", "entidadId", "createdAt");

-- CreateIndex
CREATE INDEX "Auditoria_usuarioId_createdAt_idx" ON "Auditoria"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "Auditoria_correlacionId_idx" ON "Auditoria"("correlacionId");

-- AddForeignKey
ALTER TABLE "ConsultaNegativos" ADD CONSTRAINT "ConsultaNegativos_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaNegativos" ADD CONSTRAINT "ConsultaNegativos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleConsultaNegativos" ADD CONSTRAINT "DetalleConsultaNegativos_consultaId_bodegaId_fkey" FOREIGN KEY ("consultaId", "bodegaId") REFERENCES "ConsultaNegativos"("id", "bodegaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleConsultaNegativos" ADD CONSTRAINT "DetalleConsultaNegativos_negativoId_bodegaId_fkey" FOREIGN KEY ("negativoId", "bodegaId") REFERENCES "Negativo"("id", "bodegaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialNegativo" ADD CONSTRAINT "HistorialNegativo_negativoId_fkey" FOREIGN KEY ("negativoId") REFERENCES "Negativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialNegativo" ADD CONSTRAINT "HistorialNegativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialNegativo" ADD CONSTRAINT "HistorialNegativo_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "ConsultaNegativos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de integridad adicionales: conservarlas al crear migraciones futuras.
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_codigoBarra_no_vacio" CHECK (length(btrim("codigoBarra")) > 0);
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_codigo_no_vacio" CHECK (length(btrim("codigo")) > 0);
ALTER TABLE "DetalleConsultaNegativos" ADD CONSTRAINT "Detalle_existencia_negativa" CHECK ("existencia" < 0);
ALTER TABLE "DetalleConsultaNegativos" ADD CONSTRAINT "Detalle_fila_positiva" CHECK ("numeroFila" > 0);
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_conteo_no_negativo" CHECK ("conteoFisico" IS NULL OR "conteoFisico" >= 0);
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_detecciones_ordenadas" CHECK ("ultimaDeteccion" >= "primeraDeteccion");
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_version_positiva" CHECK ("version" > 0);
ALTER TABLE "Negativo" ADD CONSTRAINT "Negativo_anulacion_motivada" CHECK (
  ("anuladoAt" IS NULL AND "motivoAnulacion" IS NULL) OR
  ("anuladoAt" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND length(btrim("motivoAnulacion")) > 0)
);
ALTER TABLE "ConsultaNegativos" ADD CONSTRAINT "Consulta_fecha_valida" CHECK (isfinite("fechaConsulta") AND "fechaConsulta" <= "fechaImportacion");
ALTER TABLE "ConsultaNegativos" ADD CONSTRAINT "Consulta_reversion_coherente" CHECK (
  ("estado" = 'APLICADA' AND "revertidaAt" IS NULL) OR
  ("estado" = 'REVERTIDA' AND "revertidaAt" IS NOT NULL)
);

COMMIT;
