# Sesión 2.1 — Autenticación

La [sesión 2.2](sesion-2.2.md) añade la autorización sobre esta base. Desde esa sesión, los roles requieren asignaciones de alcance explícitas y ya no basta una sesión activa para acceder a todos los datos.

PDMC requiere una sesión de usuario para abrir el panel y todas las API de Negativos. El token técnico de 1.2 ya no permite acceder por sí solo. No se han implementado permisos detallados por módulo ni pantallas de administración; los roles quedan registrados para esa sesión posterior.

## Implementación

- Autenticación local del servidor Next.js, con usuarios y sesiones revocables en PostgreSQL mediante Prisma. No depende de un proveedor externo ni registra usuarios públicamente.
- Contraseñas con `scrypt` de Node.js: N=131072, r=8, p=1, sal aleatoria de 16 bytes y derivación de 64 bytes. Solo se persiste el hash. Política de 12–128 caracteres; no se recortan ni registran contraseñas.
- Sesiones con token aleatorio de 32 bytes. PostgreSQL guarda únicamente su SHA-256. Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` y prefijo `__Host-` con HTTPS. Persistencia absoluta de 8 horas; sesiones temporales limitadas a 15 minutos. Bloquear, desactivar, restablecer o cambiar la contraseña impide utilizar las sesiones anteriores.
- Contraseñas temporales válidas 48 horas. Una cuenta invitada solo puede consultar su sesión, cambiar su contraseña y salir. La comprobación se hace en servidor, también para peticiones directas a la API. Después del cambio se exige iniciar una sesión nueva.
- Límite persistente de 10 intentos de inicio por cuenta y ventana de 15 minutos, 100 globales y 5 intentos de cambio por usuario. El hash tiene un límite de concurrencia para contener el consumo de memoria. Los errores de acceso no revelan si existe el correo.
- Escrituras protegidas por un origen fijo de servidor (`PDMC_AUTH_ORIGIN`), sin confiar en cabeceras reenviadas para autorizar una solicitud. HTTP solo se permite en loopback; la red local utiliza HTTPS.
- Los datos del prototipo se envían desde la página autenticada. Ya no se incluyen en un módulo de datos importado por JavaScript público. Las sesiones no se guardan en localStorage.
- Auditoría de `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `LOGOUT`, `PASSWORD_CAMBIADO`, `PASSWORD_FALLIDO`, `PASSWORD_RESTABLECIDO`, `USUARIO_INICIAL_CREADO` y `ESTADO_USUARIO_CAMBIADO`. Los registros no incluyen contraseñas, hashes de contraseña ni tokens de sesión.

Estados: `INVITADO` debe completar el cambio inicial; `ACTIVO` puede ingresar; `BLOQUEADO` e `INACTIVO` no pueden ingresar. Se conserva la columna histórica `activo` y ambos controles deben permitir el acceso.

## Crear las cuentas reales

No hay credenciales predeterminadas. En el entorno privado del servidor —o `.env.local`, excluido de Git— configure los correos reales y contraseñas temporales generadas con un gestor de contraseñas. No las escriba en conversaciones, argumentos de consola, código ni archivos versionados.

Para el administrador inicial se usan `PDMC_SEED_ADMINISTRADOR_EMAIL`, `PDMC_SEED_ADMINISTRADOR_PASSWORD` y, opcionalmente, `PDMC_SEED_ADMINISTRADOR_NOMBRE`.

Luego ejecute desde el proyecto:

```powershell
npm run crear-usuarios-iniciales
```

El comando valida todo antes de escribir y crea las cuentas en una transacción. Al repetirlo conserva contraseñas, estados, roles y sesiones de las cuentas existentes; nunca restaura una clave temporal después de cambiarla. Si un correo existente tiene otro rol, informa un conflicto y no modifica nada. No ejecuta el seed automáticamente al arrancar.

Los diez prefijos admitidos son:

| Rol | Prefijo de variables |
| --- | --- |
| Administrador | `PDMC_SEED_ADMINISTRADOR` |
| Mejora Continua | `PDMC_SEED_MEJORA_CONTINUA` |
| Supervisor | `PDMC_SEED_SUPERVISOR` |
| Rectificación | `PDMC_SEED_RECTIFICACION` |
| Jefe de Bodega | `PDMC_SEED_JEFE_BODEGA` |
| Recepción/Bodega | `PDMC_SEED_RECEPCION_BODEGA` |
| Etiquetado | `PDMC_SEED_ETIQUETADO` |
| Facturación | `PDMC_SEED_FACTURACION` |
| Tienda | `PDMC_SEED_TIENDA` |
| Consulta/Auditoría | `PDMC_SEED_CONSULTA_AUDITORIA` |

A cada prefijo se añaden `_EMAIL`, `_PASSWORD` y opcionalmente `_NOMBRE`. Los roles sin variables se omiten; los incompletos se rechazan. Cada cuenta usa un correo distinto. La plantilla `.env.example` contiene solo campos vacíos, sin contraseñas de ejemplo. Retire las variables de contraseñas temporales cuando haya completado la distribución por un canal privado.

## Recuperación administrativa básica

El operador autorizado del servidor puede ejecutar `npm run administrar-usuario`. Es un canal de recuperación de consola con acceso al entorno de PostgreSQL, no una API pública. Debe indicar un administrador habilitado existente como responsable de auditoría:

- `PDMC_ADMIN_ACTOR_EMAIL`: correo del administrador responsable.
- `PDMC_ADMIN_USUARIO_EMAIL`: cuenta objetivo.
- `PDMC_ADMIN_MOTIVO`: motivo de la operación, sin secretos.
- `PDMC_ADMIN_PASSWORD_TEMPORAL`: contraseña temporal nueva, configurada privadamente en el entorno.

El comando revoca las sesiones del usuario, registra la operación y obliga a cambiar la contraseña. No desbloquea automáticamente una cuenta bloqueada o inactiva.

Para cambiar el estado, deje sin configurar `PDMC_ADMIN_PASSWORD_TEMPORAL` y configure `PDMC_ADMIN_ESTADO`. Se acepta `ACTIVO`, `BLOQUEADO` o `INACTIVO`; `INVITADO` permite habilitar una cuenta que ya tenga una contraseña temporal vigente. No se puede marcar como activa una cuenta que aún deba cambiar su contraseña ni deshabilitar al último administrador. Una cuenta bloqueada que necesite recuperación se restablece primero y luego se habilita como invitada en una segunda operación.

## Acceso local y desde otra PC

El iniciador `Inicia_PDMC_Red.bat` prepara HTTPS y configura el origen exacto del proceso. Conserva las claves privadas y su contraseña en `.secrets`, que nunca debe compartirse. El certificado público se exporta como `PDMC_Certificado_Red.cer`.

En cada PC que vaya a ingresar:

1. Copie **solo** `PDMC_Certificado_Red.cer` desde la PC del servidor por un canal confiable.
2. Abra el certificado y compruebe que coincide con el certificado del servidor. Su huella se muestra al generarlo.
3. Instálelo para el usuario actual en **Entidades de certificación raíz de confianza**. Acepte únicamente el certificado de su propio servidor PDMC.
4. Abra el enlace **HTTPS** que muestra el BAT, introduzca las credenciales temporales y complete el cambio obligatorio.

No omita la validación del certificado ni utilice HTTP para enviar contraseñas por la red. Si cambia la IP o se renueva el certificado, el iniciador genera el certificado correspondiente y será necesario confiar en el nuevo certificado. Para una instalación con dominio puede usarse un certificado de una CA mediante `PDMC_TLS_PFX_FILE` y `PDMC_TLS_PASSWORD_FILE`.

`npm start` utiliza el servidor seguro y `PDMC_AUTH_ORIGIN`; HTTP solo puede escuchar en `127.0.0.1`. Para desarrollo local configure un origen loopback acorde al puerto. El HTTP loopback usa una cookie local sin `Secure`, una excepción que no se permite para IPs de red.

## Migración y archivos principales

`202609100001_autenticacion` agrega estados/roles y campos de credenciales a `Usuario`, `SesionUsuario`, `IntentoAcceso` y unicidad insensible a mayúsculas del correo. No borra datos anteriores ni asigna contraseñas a usuarios antiguos automáticamente.

- `backend/src/auth/`: hash, sesiones, protección, aprovisionamiento y recuperación.
- `app/login`, `app/cambiar-contrasena`, `app/api/auth/[action]`: interfaz y endpoints de sesión.
- `app/page.tsx`: entrada de servidor protegida; `frontend/components/dashboard.tsx`: interfaz con datos autenticados.
- `backend/src/negativos/http.ts`: sesión obligatoria en todas las rutas existentes.
- `scripts/crear-usuarios-iniciales.ts`, `scripts/administrar-usuario.ts`: comandos privados.
- `scripts/servidor-pdmc.mjs`, `scripts/preparar-https.ps1`: transporte HTTPS y certificado local.

## Verificación

```powershell
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
node tests/interfaz.browser.mjs
npm run db:check
```

Las pruebas utilizan esquemas PostgreSQL y perfiles de navegador aislados, con contraseñas aleatorias generadas durante la ejecución. Cubren seed de los diez roles y repetición, primera contraseña, bloqueo/inactividad/vencimiento, cookies, CSRF, recuperación, auditoría sin secretos, límites de intentos y rollback. El navegador comprueba login, cambio obligatorio, recarga, otro contexto autenticado, logout y regresión del módulo Negativos.

La entrega requiere configurar las cuentas reales mediante el comando anterior y confiar en el certificado en cada PC. No se han añadido permisos detallados, MFA, correo de recuperación, registro público ni pantallas administrativas completas.

Referencias utilizadas: [autenticación en Next.js](https://nextjs.org/docs/app/guides/authentication), [almacenamiento de contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) y [scrypt de Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
