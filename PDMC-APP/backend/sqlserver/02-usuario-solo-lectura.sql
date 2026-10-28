-- Usuario de solo lectura para que PDMC ejecute automáticamente las consultas
-- de sqlserver/consultas (las mismas de consultaPDMC). Lo ejecuta un DBA.
-- No modifica tablas ni activa ninguna función de SQL Server.

USE [master];
GO
-- El DBA define la contraseña; no se guarda en este archivo ni en el repositorio.
-- CREATE LOGIN pdmc_sync WITH PASSWORD = N'<definir>', CHECK_POLICY = ON;
GO

USE [GDC_CASA_MATRIZ];
GO
-- CREATE USER pdmc_sync FOR LOGIN pdmc_sync;

-- Solo las tablas que leen las consultas de PDMC.
GRANT SELECT ON OBJECT::dbo.TRANSFERENCIAS TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.MOVTRANSFERENCIAS TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.USUARIOS TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.SUCURSALES TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.INVENTARIO TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.CATEGORIAS TO pdmc_sync;
GRANT SELECT ON OBJECT::dbo.MARCAS TO pdmc_sync;
GO

-- Comprobación: debe listar solo permisos SELECT sobre esas 7 tablas.
SELECT pr.name AS usuario, pe.permission_name, OBJECT_NAME(pe.major_id) AS tabla
FROM sys.database_permissions AS pe
JOIN sys.database_principals AS pr ON pr.principal_id = pe.grantee_principal_id
WHERE pr.name = N'pdmc_sync';
