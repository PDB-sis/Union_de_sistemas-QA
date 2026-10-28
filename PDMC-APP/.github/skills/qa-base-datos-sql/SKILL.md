---
name: qa-base-datos-sql
description: Validate PDMC PostgreSQL schema, Prisma migrations, data integrity, and read-only SQL Server synchronization behavior safely.
---

# QA de base de datos y SQL de PDMC

Valida cambios de esquema, migraciones, consultas e integridad de datos sin poner en riesgo información compartida. PDMC usa PostgreSQL y consume consultas de SQL Server; distingue ambos sistemas y sus permisos.

## Procedimiento

1. Identifica motor, esquema, migraciones y servicios afectados. Lee la migración completa y las pruebas pertinentes antes de ejecutar operaciones.
2. Comprueba restricciones, claves, nulabilidad, índices, relaciones, unicidad, auditoría y comportamiento ante duplicados o registros históricos.
3. Para migraciones, valida tanto los objetos que deben existir como los que se retiran, y confirma que los registros vigentes e históricos se preservan según la intención.
4. Prefiere las comprobaciones seguras existentes: `npm run db:validate`, `npm test` y, cuando haga falta PostgreSQL, `npm run test:integration`. Las unitarias de base de datos usan PGlite en memoria; las de integración usan un esquema de pruebas aislado.
5. Para SQL Server, revisa `docs/sincronizacion-sqlserver.md` y `tests/backend/sqlserver-solo-lectura.test.mjs`. Las consultas configuradas para sincronización deben ser de solo lectura. Verifica manejo de filas inválidas, ausencia de importación parcial y conservación de datos previos ante error.
6. Usa datos sintéticos y una base local/descartable. Ejecuta solo las operaciones que el caso necesita y confirma el destino antes de cualquier comando que escriba.
7. Reporta motor y entorno sin revelar host, usuario, cadena de conexión ni datos empresariales; describe las filas afectadas usando conteos o identificadores ficticios.

## Límites de seguridad

- Nunca ejecutes pruebas, migraciones, `DROP`, `TRUNCATE`, `DELETE`, restablecimientos, seeds o sincronizaciones sobre producción o bases compartidas.
- No uses `prisma migrate reset` como método de validación. No asumas que un nombre de base o una variable configurada identifica un entorno seguro: comprueba explícitamente que sea local o de pruebas antes de correr integración.
- No conviertas credenciales SQL Server en archivos de prueba ni expongas variables de entorno. Las consultas SQL Server deben permanecer de solo lectura salvo autorización expresa y un entorno aislado preparado.
- Si no se puede demostrar que el destino es descartable, detén la ejecución y reporta el bloqueo en vez de intentar la operación.
