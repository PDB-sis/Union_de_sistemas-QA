CREATE TABLE "RestablecimientoProyecto" (
 "id" UUID PRIMARY KEY, "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
 "tokenHash" VARCHAR(64) NOT NULL, "sesionHash" VARCHAR(64) NOT NULL, "conteos" JSONB NOT NULL,
 "disponibleDesde" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "consumidoAt" TIMESTAMPTZ(3), "respaldoNombre" VARCHAR(200), "respaldoSha256" VARCHAR(64),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RestablecimientoProyecto_usuarioId_createdAt_idx" ON "RestablecimientoProyecto"("usuarioId","createdAt");
