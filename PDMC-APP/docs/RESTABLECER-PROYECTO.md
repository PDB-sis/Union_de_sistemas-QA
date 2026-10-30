# Restablecimiento protegido de PDMC

La opción está en **Administración → Restablecer proyecto**. Solo el rol
ADMINISTRADOR nacional puede consultar, preparar o ejecutar esta operación.
Abrir el módulo o revisar los datos no borra información.

## Alcance

Se eliminan inventario y productos, fotografías y expedientes de negativos,
reportes e inconsistencias, transferencias y devoluciones con sus detalles,
pedidos, observaciones de facturadores, regiones, tiendas, bodegas, catálogos,
usuarios y sus accesos. Se conserva únicamente la cuenta que confirma el
restablecimiento, su contraseña y un acceso ADMINISTRADOR nacional.

Se conserva también un comprobante de seguridad y una entrada de auditoría del
restablecimiento. La estructura de tablas y las migraciones permanecen intactas.
Todas las sesiones se revocan. Los borradores y proyectos locales de PDMC se
limpian en ese navegador y al iniciar sesión después desde otros navegadores.
El respaldo PostgreSQL no incluye datos que existan exclusivamente en un navegador.

## Protecciones

1. Revisión de los registros que se eliminarán y la cuenta que se conservará.
2. Contraseña actual, verificada en servidor y con límite de intentos.
3. Autorización vinculada al administrador y a su sesión; vence en 10 minutos.
4. Espera mínima de 30 segundos, impuesta también por el servidor.
5. Frase exacta `RESTABLECER PDMC DESDE CERO` y aceptación expresa.
6. Comprobación de que los conteos no cambiaron desde la preparación.
7. Mantenimiento temporal: se rechaza el inicio si hay otras API en curso en el
   proceso y se bloquean solicitudes nuevas mientras dura el restablecimiento.
8. Bloqueo de tablas, respaldo obligatorio y verificación antes de eliminar.
9. Limpieza transaccional sin `CASCADE`; un fallo revierte los cambios en PostgreSQL.
10. Autorización de un solo uso, verificación posterior y auditoría.

Debe utilizarse en una ventana de mantenimiento, sin importadores externos ni
otros procesos PDMC atendiendo la misma base. La protección de solicitudes en
curso corresponde al despliegue actual de un único proceso Next.js.

## Respaldo

El servidor crea un archivo PostgreSQL de formato custom y su SHA-256 en:

```text
backend/backups/restablecimientos/pdmc-FECHA-IDENTIFICADOR.dump
backend/backups/restablecimientos/pdmc-FECHA-IDENTIFICADOR.dump.sha256
```

Estos archivos no se publican por HTTP y están excluidos de Git. Contienen
información sensible, incluidos los hashes de contraseñas. Solo el operador del
servidor debe tener acceso a esa carpeta. Se incluyen esquema, datos e historial
de migraciones del esquema PostgreSQL configurado para PDMC.

Se usa `pg_dump` y se lee el archivo completo con `pg_restore --file=-` para
verificarlo. Si no están instalados y PostgreSQL está en Docker local, se detecta
el contenedor por el puerto de `DATABASE_URL` y se usan sus herramientas. Un
destino ambiguo o un respaldo fallido cancela la operación.

En servidores sin herramientas en PATH se pueden configurar las rutas privadas:

```text
PDMC_PG_DUMP_PATH=
PDMC_PG_RESTORE_PATH=
```

La cuenta PostgreSQL debe poder leer y bloquear las tablas, truncarlas y eliminar
los registros. Ante permisos insuficientes no se aplica una limpieza parcial.

## Recuperación por el operador

Conserva el `.dump` y su `.sha256` fuera del equipo antes de trasladar o retirar
el servidor. Comprueba el SHA-256 y restaura primero en una **base nueva**, por
ejemplo `pdmc_recuperacion`, con una versión compatible de PostgreSQL:

```sh
createdb --host HOST --port PUERTO --username USUARIO pdmc_recuperacion
pg_restore --host HOST --port PUERTO --username USUARIO --dbname pdmc_recuperacion --clean --if-exists --no-owner --exit-on-error RUTA_AL_RESPALDO.dump
```

Usa el mecanismo seguro de credenciales del servidor; no escribas contraseñas en
estos comandos. En Docker se pueden ejecutar las mismas herramientas dentro del
contenedor después de copiar allí el archivo. Los comandos de recuperación se
dirigen exclusivamente a la base nueva, nunca a la base operativa actual.

Después de restaurar, revisa los datos y revoca las sesiones recuperadas antes
de cambiar `DATABASE_URL` hacia la base restaurada y reiniciar PDMC.

## Instalar esta mejora

```sh
npm ci
npm run db:migrate -w backend
npm run build
```

Reinicia la aplicación. La migración solo agrega la tabla de confirmaciones;
no ejecuta el restablecimiento ni modifica los datos operativos existentes.
