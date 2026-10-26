# Sesión 2.2 — Autorización

Los permisos se definen en `shared/auth/permissions.ts`. El servidor los evalúa mediante `Authorization` en `backend/src/auth/authorization.ts`. Las decisiones no usan `Usuario.rol`: ese campo se conserva para compatibilidad con el seed y la sesión 2.1. La autoridad proviene de las filas `AsignacionAcceso`.

## Matriz inicial

Cada permiso se limita al alcance de la asignación que lo concede. «Panel nacional» requiere además una asignación nacional, porque los paneles históricos actuales contienen un conjunto agregado sin vínculos fiables con las nuevas ubicaciones.

| Rol | Leer negativos | Editar seguimiento / estado de investigación | Aprobar ajuste | Registrar ajuste / solucionar | Importar | Anular caso / consulta | Migrar y consultar respaldo | Panel nacional | Administrar usuarios, ubicaciones y accesos |
|---|---|---|---|---|---|---|---|---|---|
| Administrador | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Mejora Continua | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí | No |
| Supervisor | Sí | Sí | Sí | No | Sí | No | No | Sí | No |
| Rectificación | Sí | Solo conteo físico | No | No | No | No | No | No | No |
| Jefe de Bodega | Sí | Sí | Sí | No | Sí | No | No | No | No |
| Recepción/Bodega | Sí | Sí | No | No | No | No | No | No | No |
| Etiquetado | Sí | Sí | No | No | No | No | No | No | No |
| Tienda | Sí | Sí | No | No | No | No | No | No | No |
| Facturación | Sí | Sí | No | No | No | No | No | No | No |
| Consulta/Auditoría | Sí | No | No | No | No | No | No | Sí | No |

Los permisos individuales son `panel.leer`, `negativos.leer`, `negativos.conteo`, `negativos.editar`, `negativos.estado`, `negativos.aprobar`, `negativos.ajustar`, `negativos.anular`, `ubicaciones.administrar`, `accesos.administrar` y `usuarios.administrar`.

Cambiar a `AJUSTE_AUTORIZADO` o al estado histórico `ESPERANDO_DECISION` exige aprobar. Registrar o modificar el número de ajuste, pasar a `AJUSTE_REALIZADO`, `SOLUCIONADO` o `CERRADO_SIN_AJUSTE` exige ajustar. Editar otro campo conservando esos valores no exige aprobar nuevamente. Las comprobaciones se aplican también a la edición masiva.

Administrar ubicaciones, usuarios o accesos, y migrar/descargar respaldos completos, requiere alcance nacional. La matriz es una política inicial conservadora; se modifica centralmente, junto con sus pruebas.

## Alcances y datos existentes

- Nacional: `ubicacionId = null`, concedido explícitamente. Incluye datos históricos sin ubicación.
- Región: una `Ubicacion` de tipo `REGION`, con acceso a las tiendas y bodegas de esa región.
- Bodega o tienda: una ubicación concreta. Cada una tiene su propio depósito operativo `Bodega`, que contiene consultas y expedientes de negativos. Una tienda no recibe acceso a otras tiendas de su región por compartir región.
- Varias ubicaciones: varias asignaciones. Cada fila conserva juntos rol y ubicación. Lectura nacional más Rectificación en tienda A permite leer nacionalmente y registrar el conteo físico solamente en A.

La migración `202609110001_autorizacion` crea las tablas y conserva como nacionales únicamente los administradores anteriores. El seed crea esa asignación para nuevos administradores; los otros roles quedan sin acceso operativo hasta asignarles un alcance explícito. Reejecutar el seed no restaura asignaciones revocadas.

Las bodegas anteriores permanecen sin ubicación hasta que un administrador las vincule expresamente. No se deducen tiendas desde textos de archivos. La jerarquía y los vínculos ya establecidos son inmutables mediante las restricciones de PostgreSQL; cambiar el destino de expedientes requiere una futura operación específica, no editar una ubicación.

Los usuarios con alcance local ven Negativos con sus datos autorizados. No reciben el contenido de los paneles nacionales en HTML, respuestas RSC ni propiedades de componentes. Los paneles históricos de transferencias, inconsistencias, etiquetado, facturación y proyectos mantienen acceso nacional mediante `panel.leer`; habilitarlos por tienda requiere primero vincular sus fuentes con ubicaciones. Esta sesión no migra esos otros módulos.

## Configurar ubicaciones y accesos sin administrador visual

Primero aplicar el esquema:

```powershell
npm run db:migrate
```

Usar PowerShell en el servidor. Los siguientes comandos no contienen contraseñas. Sustituir el correo por el de un administrador inicial existente y habilitado. El comando comprueba su permiso nacional y registra su identidad y el motivo. Es un canal local del operador que ya dispone de acceso a PostgreSQL, no un endpoint accesible desde el navegador.

```powershell
$env:PDMC_ADMIN_ACTOR_EMAIL = 'administrador@su-organizacion.com'
$env:PDMC_ADMIN_MOTIVO = 'Configuracion inicial autorizada de ubicaciones'
$env:PDMC_UBICACION = '{"codigo":"CENTRO","nombre":"Region Centro","tipo":"REGION"}'
npm run administrar-accesos

$env:PDMC_UBICACION = '{"codigo":"TIENDA-01","nombre":"Tienda 01","tipo":"TIENDA","regionCodigo":"CENTRO"}'
npm run administrar-accesos

$env:PDMC_UBICACION = '{"codigo":"BODEGA-01","nombre":"Bodega 01","tipo":"BODEGA","regionCodigo":"CENTRO"}'
npm run administrar-accesos
Remove-Item Env:PDMC_UBICACION
```

Para vincular una bodega **existente** al crear una ubicación, añadir `"bodegaId":"UUID-REAL-DEL-DEPOSITO"` al JSON de tienda o bodega. Verificar antes que todos sus expedientes pertenecen al destino indicado. El comando rechaza depósitos ya vinculados o inactivos y registra el vínculo en auditoría. Omitir `bodegaId` crea un depósito vacío. Repetir el mismo JSON no duplica ubicaciones.

Asignar uno o varios roles y ubicaciones a una cuenta ya creada:

```powershell
$env:PDMC_ADMIN_MOTIVO = 'Asignacion autorizada de responsabilidades'
$env:PDMC_ACCESO_USUARIO_EMAIL = 'usuario@su-organizacion.com'
$env:PDMC_ACCESO_ASIGNACIONES = '[{"rol":"TIENDA","ubicacionCodigo":"TIENDA-01"},{"rol":"RECTIFICACION","ubicacionCodigo":"BODEGA-01"}]'
npm run administrar-accesos
Remove-Item Env:PDMC_ACCESO_ASIGNACIONES
Remove-Item Env:PDMC_ACCESO_USUARIO_EMAIL
```

El JSON reemplaza **todas** las asignaciones de esa cuenta, dentro de una transacción. `[]` revoca todos los accesos. `ubicacionCodigo: null` concede alcance nacional; `"CENTRO"` concede esa región. Repetir las mismas asignaciones no modifica nada. Un cambio real revoca las sesiones existentes y registra antes/después en auditoría; la persona debe iniciar sesión nuevamente. No permite dejar el sistema sin un administrador nacional habilitado.

Los identificadores de rol son las claves de `shared/auth/model.ts`: `ADMINISTRADOR`, `MEJORA_CONTINUA`, `SUPERVISOR`, `RECTIFICACION`, `JEFE_BODEGA`, `RECEPCION_BODEGA`, `ETIQUETADO`, `TIENDA`, `FACTURACION`, `CONSULTA_AUDITORIA`.

`npm run administrar-usuario` conserva recuperación y estados de 2.1, usando ahora el permiso `usuarios.administrar` y la misma protección del último administrador nacional. No se construyó un administrador visual.

## Protección y comprobaciones

Todas las rutas de negativos pasan por `endpoint`: sesión válida, origen para escrituras y servicios con `Authorization`. Crear directamente un servicio sin identidad no concede acceso. Listas, totales, comparación, consultas y detalles se filtran antes de paginar/agregar; cambiar un UUID o parámetro de bodega no amplía el alcance. Un lote con un expediente ajeno se rechaza entero y revierte cualquier cambio. No hay acceso alternativo por token técnico.

Las asignaciones se leen desde PostgreSQL en cada operación; no se toman del navegador, del nombre de rol mostrado, de localStorage ni de una cookie de permisos. La interfaz deshabilita controles según sus capacidades, pero la validación decisiva está en el servidor. Con varios destinos de importación autorizados se exige seleccionar uno.

Las únicas rutas públicas de aplicación son el formulario de login y su operación de autenticación. Consultar sesión, cambiar contraseña y cerrar sesión conservan sus reglas de autenticación. Los recursos estáticos no contienen el conjunto nacional de datos.

```powershell
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
node tests/interfaz.browser.mjs
npm run db:status
npm run db:check
```

Las pruebas usan esquemas PostgreSQL y perfiles Edge aislados. Cubren los diez roles, los cuatro alcances, combinaciones, totales, consultas, detalle, manipulación de identificadores, ediciones/importaciones/anulaciones, respaldo, revocación, auditoría, rollback y denegación anónima de todas las familias de endpoints sensibles.

Verificación manual: asignar dos cuentas a tiendas distintas; entrar en navegadores separados; comprobar que cada cuenta solo ve sus casos y totales; intentar abrir el detalle de la otra tienda; comprobar rechazo sin cambios. Probar además un Supervisor regional y una cuenta de Consulta/Auditoría. Revocar una asignación y comprobar que la sesión deja de operar.

Referencia de diseño: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): denegación por defecto, autorización en cada petición y pruebas de acceso a recursos.

## Validación realizada — 11 de septiembre de 2026

- 27 pruebas unitarias aprobadas.
- 26 pruebas de integración aprobadas, incluidas 7 de autorización. La protección del último administrador se ejecutó junto con la suite de autorización después de incorporarla.
- Navegador Edge: autenticación y regresión de Negativos aprobadas; cuenta de tienda sin datos nacionales en HTML/RSC, controles restringidos y revocación verificados.
- TypeScript, ESLint y build de producción correctos.
- Migración aplicada a PostgreSQL local; cuatro migraciones al día y trece entidades accesibles.

No se asignaron tiendas ni regiones reales por suposición. El operador debe registrar y asignar los destinos reales con los comandos documentados.
