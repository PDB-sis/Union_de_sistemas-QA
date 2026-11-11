-- Proyectos compartidos (módulo Proyectos): página con bloques, miembros con permiso, tareas y comentarios.
-- Solo crea tablas nuevas; no toca datos existentes.
-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('IDEA', 'EN_CURSO', 'EN_PAUSA', 'COMPLETADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "PermisoProyecto" AS ENUM ('EDITOR', 'LECTOR');

-- CreateEnum
CREATE TYPE "EstadoTareaProyecto" AS ENUM ('PENDIENTE', 'EN_CURSO', 'HECHA');

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "resumen" VARCHAR(500),
    "color" VARCHAR(20) NOT NULL DEFAULT 'azul',
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'IDEA',
    "prioridad" VARCHAR(12) NOT NULL DEFAULT 'MEDIA',
    "fechaInicio" DATE,
    "fechaObjetivo" DATE,
    "contenido" JSONB NOT NULL DEFAULT '[]',
    "propietarioId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoMiembro" (
    "id" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "permiso" "PermisoProyecto" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoMiembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoTarea" (
    "id" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "titulo" VARCHAR(300) NOT NULL,
    "estado" "EstadoTareaProyecto" NOT NULL DEFAULT 'PENDIENTE',
    "responsableId" UUID,
    "fechaLimite" DATE,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProyectoTarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoComentario" (
    "id" UUID NOT NULL,
    "proyectoId" UUID NOT NULL,
    "autorId" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proyecto_propietarioId_updatedAt_idx" ON "Proyecto"("propietarioId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProyectoMiembro_usuarioId_idx" ON "ProyectoMiembro"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoMiembro_proyectoId_usuarioId_key" ON "ProyectoMiembro"("proyectoId", "usuarioId");

-- CreateIndex
CREATE INDEX "ProyectoTarea_proyectoId_orden_idx" ON "ProyectoTarea"("proyectoId", "orden");

-- CreateIndex
CREATE INDEX "ProyectoTarea_responsableId_estado_idx" ON "ProyectoTarea"("responsableId", "estado");

-- CreateIndex
CREATE INDEX "ProyectoComentario_proyectoId_createdAt_idx" ON "ProyectoComentario"("proyectoId", "createdAt");

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMiembro" ADD CONSTRAINT "ProyectoMiembro_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMiembro" ADD CONSTRAINT "ProyectoMiembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoTarea" ADD CONSTRAINT "ProyectoTarea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoTarea" ADD CONSTRAINT "ProyectoTarea_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComentario" ADD CONSTRAINT "ProyectoComentario_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComentario" ADD CONSTRAINT "ProyectoComentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

