CREATE TYPE "EstadoUsuario" AS ENUM ('INVITADO', 'ACTIVO', 'BLOQUEADO', 'INACTIVO');
CREATE TYPE "RolUsuario" AS ENUM ('ADMINISTRADOR', 'MEJORA_CONTINUA', 'SUPERVISOR', 'RECTIFICACION', 'JEFE_BODEGA', 'RECEPCION_BODEGA', 'ETIQUETADO', 'FACTURACION', 'TIENDA', 'CONSULTA_AUDITORIA');
ALTER TABLE "Usuario"
  ADD COLUMN "estado" "EstadoUsuario" NOT NULL DEFAULT 'INVITADO',
  ADD COLUMN "rol" "RolUsuario" NOT NULL DEFAULT 'CONSULTA_AUDITORIA',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "passwordTemporalHasta" TIMESTAMPTZ(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMPTZ(3);
UPDATE "Usuario" SET "estado" = 'INACTIVO' WHERE "activo" = false;
CREATE UNIQUE INDEX "Usuario_email_insensible_key" ON "Usuario" (lower("email"));
CREATE TABLE "SesionUsuario" (
  "id" UUID PRIMARY KEY,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "SesionUsuario_usuarioId_idx" ON "SesionUsuario"("usuarioId");
CREATE INDEX "SesionUsuario_expiresAt_idx" ON "SesionUsuario"("expiresAt");
CREATE TABLE "IntentoAcceso" (
  "clave" VARCHAR(64) PRIMARY KEY,
  "intentos" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "IntentoAcceso_expiresAt_idx" ON "IntentoAcceso"("expiresAt");
