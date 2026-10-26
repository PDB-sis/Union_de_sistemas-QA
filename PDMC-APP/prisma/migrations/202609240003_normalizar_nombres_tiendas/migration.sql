BEGIN;

WITH nombres("codigo","nombre") AS (
  VALUES
    ('510101','AV. LIBERTADOR - OCCIDENTE (DIANA)'),
    ('410101','C.C PLAZA LAGO - PIOLIN (KAROL)'),
    ('1010105','C.C. CIUDAD CHINITA 2 (DOUGLAS)'),
    ('1010104','C.C. DORAL CENTER MALL (JOHANNY)'),
    ('210103','COSTA MALL - EMBELLESO (YOENNY)')
)
INSERT INTO "Auditoria" ("id","entidadId","entidad","accion","origen","motivo","valorAnterior","valorNuevo","createdAt")
SELECT gen_random_uuid(),u."id",'Ubicacion','NORMALIZAR_NOMBRE_TIENDA','MIGRACION','Nombre de tienda normalizado para enlazar reportes de Google Sheets',jsonb_build_object('codigo',u."codigo",'nombre',u."nombre"),jsonb_build_object('codigo',u."codigo",'nombre',n."nombre"),CURRENT_TIMESTAMP
FROM "Ubicacion" u JOIN nombres n ON n."codigo"=u."codigo"
WHERE u."tipo"='TIENDA' AND u."nombre"<>n."nombre";

WITH nombres("codigo","nombre") AS (
  VALUES
    ('510101','AV. LIBERTADOR - OCCIDENTE (DIANA)'),
    ('410101','C.C PLAZA LAGO - PIOLIN (KAROL)'),
    ('1010105','C.C. CIUDAD CHINITA 2 (DOUGLAS)'),
    ('1010104','C.C. DORAL CENTER MALL (JOHANNY)'),
    ('210103','COSTA MALL - EMBELLESO (YOENNY)')
)
UPDATE "Ubicacion" u SET "nombre"=n."nombre" FROM nombres n
WHERE u."codigo"=n."codigo" AND u."tipo"='TIENDA' AND u."nombre"<>n."nombre";

UPDATE "Tienda" t SET "nombre"=u."nombre","updatedAt"=CURRENT_TIMESTAMP
FROM "Ubicacion" u
WHERE t."ubicacionId"=u."id" AND t."nombre"<>u."nombre";

COMMIT;
