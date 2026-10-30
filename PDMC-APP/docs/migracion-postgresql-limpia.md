# Migración limpia de PostgreSQL

Este procedimiento crea una instalación nueva de PDMC sin datos operativos y conserva únicamente una cuenta administradora activa.

## Resultado esperado

- Esquema completo creado mediante migraciones Prisma.
- Una fila en `Usuario`.
- Una asignación nacional con rol `ADMINISTRADOR`.
- Sin tiendas, inventario, transferencias, negativos, inconsistencias, reportes ni auditorías provenientes de la instalación anterior.

## Variables privadas del servidor

Configure temporalmente en el entorno del servidor:

```text
PDMC_SOURCE_DATABASE_URL=postgresql://usuario:clave@servidor-origen:5432/pdmc?schema=public
DATABASE_URL=postgresql://usuario:clave@servidor-destino:5432/pdmc?schema=public
PDMC_MIGRATION_ADMIN_EMAIL=correo-del-administrador
```

No guarde estas conexiones en GitHub.

## Ejecución

```bash
npm ci
npm run db:migrate -w backend
npm run db:migrar-admin-limpio -w backend
```

`db:migrate` se ejecuta usando `DATABASE_URL`, por lo que aplica el esquema exclusivamente en el destino. El segundo comando rechaza destinos que ya contengan información y nunca copia sesiones ni registros operativos.

Después de verificar el acceso del administrador, retire `PDMC_SOURCE_DATABASE_URL` del entorno del servidor.
