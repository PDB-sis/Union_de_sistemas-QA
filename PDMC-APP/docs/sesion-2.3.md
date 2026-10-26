# Sesión 2.3 — Administración de usuarios y auditoría

## Acceso y uso

Ingresar con una cuenta administradora activa, con contraseña definitiva. En la franja superior del panel aparece **Administración**, también disponible en `/administracion`.

### Usuarios y accesos

1. **Crear usuario**: indicar nombre visible, correo de acceso, contraseña temporal y motivo. El correo es el nombre de usuario del sistema y es único sin distinguir mayúsculas. Dos personas pueden compartir nombre visible.
2. Agregar cada combinación de rol y alcance: nacional, región, bodega o tienda. Para varios roles o ubicaciones, agregar varias filas. Una cuenta sin asignaciones no obtiene accesos operativos.
3. Guardar y comunicar la contraseña temporal por el canal privado establecido por la organización. Vence en 48 horas y exige cambio al ingresar. La aplicación no permite recuperarla ni mostrarla después de guardar; si se pierde, se establece otra.
4. **Editar** cambia nombre, correo y asignaciones. Una versión desactualizada se rechaza para evitar pisar otra edición. Los cambios de correo o permisos cierran las sesiones de esa cuenta; los permisos se vuelven a leer desde PostgreSQL en cada operación.
5. **Bloquear** impide el acceso; **Desactivar** retira de operación sin eliminar historial; **Reactivar** vuelve a habilitar una cuenta con contraseña válida. Si mantiene una contraseña temporal vigente, se reactiva como invitada y debe cambiarla. Una temporal vencida requiere restablecimiento previo.
6. **Restablecer clave** establece una nueva temporal y revoca las sesiones. El bloqueo o inactividad se conserva hasta reactivar explícitamente.
7. Al bloquear o desactivar, puede seleccionarse otro responsable. **Reasignar casos** también está disponible de forma independiente. Transfiere negativos pendientes asignados a la cuenta, conserva los resueltos y anulados, incrementa las versiones y registra el cambio en cada expediente. El receptor debe estar activo, con contraseña definitiva y permiso de edición en todos los casos afectados. Si alguno no está permitido, se revierte toda la operación.

No hay eliminación de usuarios ni de su historial. Otro administrador debe modificar los accesos o el estado de la propia cuenta; para cambiar su contraseña se usa **Cambiar contraseña**.

### Entidades operativas

1. Crear una región, si se necesitan alcances territoriales.
2. Crear tiendas o bodegas, asignándoles esa región.
3. Crear perfiles laborales de **facturadora** o **etiquetadora**, con código y nombre; su ubicación es opcional.
4. Usar **Vincular usuarios** para asociar una o varias cuentas a la entidad. Una cuenta puede vincularse a varias entidades.

Una entidad no es una cuenta de acceso: puede existir sin usuarios ni contraseña. Los vínculos laborales **no conceden roles o permisos**. Estos se asignan en Usuarios y accesos.

Se conserva el funcionamiento general de Negativos aprobado previamente: crear una bodega desde este panel agrega una ubicación informativa al selector del producto, pero no crea destinos de importación ni divide las consultas. Los nuevos alcances territoriales no trasladan ni atribuyen automáticamente datos históricos nacionales. Los datos sin ubicación territorial siguen requiriendo acceso nacional.

### Auditoría

Visor de solo lectura con fecha, usuario, acción, entidad, identificador, motivo, origen y detalle antes/después. Incluye búsqueda, usuario, acción y entidad exactas, identificador y rango de fechas. Fechas de filtro y visualización usan la zona horaria del navegador; PostgreSQL almacena instantes UTC.

Usuarios, entidades, buscadores de selección y auditoría se filtran y paginan en el servidor. Tamaño predeterminado: 25; máximo API: 100. No se descarga la tabla completa para filtrar en el navegador.

El origen de nuevas acciones web identifica método y ruta, derivados por el servidor sin confiar en cabeceras reenviadas. Eventos históricos permanecen intactos; los que no tenían origen aparecen como `SERVIDOR`, y los que no tenían actor se muestran como sistema/no registrado. No se reconstruyen identidades inexistentes.

## Reglas y permisos

La autoridad continúa en `AsignacionAcceso` y la matriz `shared/auth/permissions.ts`; no se decide por el nombre del rol ni por el campo histórico `Usuario.rol`.

| Operación | Permiso nacional requerido |
|---|---|
| Listar, crear, editar, bloquear/reactivar y restablecer usuarios | `usuarios.administrar` |
| Asignar o reemplazar accesos | Además, `accesos.administrar` |
| Crear/listar entidades operativas | `ubicaciones.administrar` |
| Vincular cuentas con entidades | Además, `usuarios.administrar` |
| Consultar auditoría | `auditoria.leer` |
| Reasignar negativos | Administración de usuarios y `negativos.editar` del actor y receptor en cada caso |

La matriz inicial concede administración y visor global únicamente al Administrador nacional. No amplía automáticamente al rol Consulta/Auditoría el acceso a eventos de todas las cuentas. La delegación comprueba cada permiso de cada rol solicitado sobre su propio territorio: el actor tampoco puede modificar, bloquear o restablecer una cuenta con accesos superiores a los que puede administrar.

Las mutaciones administrativas se serializan con el bloqueo transaccional compartido por los comandos de 2.1/2.2. También se bloquean las cuentas afectadas y las particiones de expedientes al reasignar. Se conserva un administrador activo con contraseña definitiva; un administrador invitado no sustituye esta garantía del panel web. Los comandos locales de recuperación siguen siendo un canal reservado al operador del servidor y no se exponen por HTTP.

La auditoría se inserta dentro de la misma transacción de cada operación crítica. Un fallo al auditar revierte el cambio. PostgreSQL rechaza `UPDATE` y `DELETE` sobre `Auditoria` mediante trigger; no existen endpoints de edición/eliminación del registro. Los administradores de la base siguen teniendo facultades técnicas fuera de la interfaz ordinaria.

## Negativos: cobertura de auditoría

Se registra actor, origen, identificador y antes/después para importación, recálculo, anulación de consultas, edición de seguimiento, cambios masivos, anulación de expedientes y reasignación de responsables. Confirmación y verificación de migraciones locales conservan auditoría con origen web. Los cambios automáticos mantienen además el historial por expediente. Las contraseñas, hashes y tokens nunca forman parte de la respuesta administrativa ni de estos registros.

## Implementación y validación

- Migración aditiva `202609140001_administracion`: `PerfilLaboral`, `VinculoOperativo`, columna `Auditoria.origen`, índice de paginación e inmutabilidad de auditoría. No elimina cuentas, consultas ni expedientes.
- Página `/administracion`; API `/api/admin/[...path]`; servicio `backend/src/admin/service.ts`. Se reutilizan sesión segura, validación de origen, lectura JSON limitada y errores controlados.
- `tests/admin.test.mjs`: delegación por permiso/territorio y esquemas estrictos.
- `tests/admin.integration.mjs`: API protegida, duplicados, temporales y revocación, límites de delegación, versiones, entidades/vínculos, transferencia con rollback, último administrador/concurrencia, auditoría inmutable y operaciones de negativos.
- `tests/admin.browser.mjs`, ejecutado desde `tests/interfaz.browser.mjs`: alta, edición, bloqueo, reactivación, restablecimiento, creación y vinculación de entidades, asignación territorial persistente y lectura de auditoría.
- Las pruebas PostgreSQL crean y eliminan esquemas exclusivos; el navegador usa un perfil temporal y cuentas sintéticas. No modifican datos operativos reales.

Comprobaciones reproducibles desde la carpeta del proyecto:

```powershell
npm test
npm run test:integration
npm run lint
npm run build
node tests/interfaz.browser.mjs
npm run db:status
npm run db:check
```

Para otra instalación, aplicar `npm run db:migrate` antes de iniciar la versión nueva. La comprobación de navegador requiere Edge en Windows o `PDMC_TEST_EDGE_PATH` configurado. No se implementa el módulo de transferencias en esta sesión.

## Cierre validado — 14 de septiembre de 2026

- 30 pruebas unitarias y 36 de integración aprobadas; recorrido completo de administración y regresión del panel anterior aprobados en Edge.
- Lint sin errores ni advertencias y build de producción exitoso.
- Migración aplicada: 6 migraciones al día y 18 entidades accesibles en PostgreSQL.
- Copia operativa previa sin hashes de contraseña en `backups/antes-sesion-2.3.json`. La comparación de sumas SHA-256 antes/después confirmó intactas las 9 tablas respaldadas: usuarios, accesos, ubicaciones, bodegas, productos, negativos, consultas, detalles e historial.
- Comprobaciones HTTPS con certificado verificado: login responde 200, administración anónima redirige a login y las tres APIs administrativas rechazan anónimos con 401.
- La IP física actual pasó a `192.168.0.143`; el origen, certificado público y archivo `Enlace_PDMC_Red.txt` se actualizaron. El acceso actual es `https://192.168.0.143:3000`. Para confiar en el nuevo certificado desde un navegador, instalar el archivo público actualizado `PDMC_Certificado_Red.cer` en los equipos que accederán, como en el procedimiento de red existente. No se alteraron reglas del firewall.
