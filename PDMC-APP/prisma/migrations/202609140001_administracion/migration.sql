ALTER TABLE "Auditoria" ADD COLUMN "origen" VARCHAR(300) NOT NULL DEFAULT 'SERVIDOR';
CREATE INDEX "Auditoria_createdAt_id_idx" ON "Auditoria"("createdAt", "id");
CREATE FUNCTION pdmc_auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'La auditoría es inmutable';
END $$;
CREATE TRIGGER "Auditoria_inmutable" BEFORE UPDATE OR DELETE ON "Auditoria"
 FOR EACH ROW EXECUTE FUNCTION pdmc_auditoria_inmutable();
CREATE TABLE "PerfilLaboral" (
 "id" UUID PRIMARY KEY, "codigo" VARCHAR(80) NOT NULL UNIQUE, "nombre" VARCHAR(200) NOT NULL,
 "tipo" VARCHAR(20) NOT NULL CHECK ("tipo" IN ('FACTURACION','ETIQUETADO')),
 "activo" BOOLEAN NOT NULL DEFAULT true, "ubicacionId" UUID REFERENCES "Ubicacion"("id") ON DELETE RESTRICT
);
CREATE TABLE "VinculoOperativo" (
 "id" UUID PRIMARY KEY, "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "ubicacionId" UUID REFERENCES "Ubicacion"("id") ON DELETE RESTRICT,
 "perfilId" UUID REFERENCES "PerfilLaboral"("id") ON DELETE RESTRICT,
 CHECK (("ubicacionId" IS NULL) <> ("perfilId" IS NULL)),
 UNIQUE("usuarioId","ubicacionId"), UNIQUE("usuarioId","perfilId")
);
