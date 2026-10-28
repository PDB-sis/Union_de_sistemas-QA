# Organización de PDMC

PDMC mantiene un monolito modular con Next.js y TypeScript. Frontend y backend
tienen carpetas y responsabilidades separadas, con un único proceso y dominio.
Esta reorganización no modifica las tablas, los datos ni las rutas públicas.

## Estructura

```text
frontend/
  components/        Interfaz de cada módulo y componentes visuales
  hooks/             Estado e interacción del navegador
  lib/               Utilidades del navegador (almacenamiento, imágenes compartibles)
  styles/            Estilos globales y temas
    vendor/          Base de shadcn/Tailwind incluida sin cambios
backend/
  prisma/            Esquema, migraciones PostgreSQL versionadas y datos iniciales
  scripts/           Usuarios, sincronización con SQL Server y comprobaciones de la base
  sqlserver/         Consultas de solo lectura a SQL Server (copias de consultaPDMC)
  http/              Implementación de las rutas HTTP por módulo
  src/
    db.ts            Cliente PostgreSQL reutilizable y exclusivo del servidor
    auth/            Sesiones, autorización y contraseñas
    admin/           Administración de usuarios y ubicaciones
    inventario/      Validación e importación de inventario
    transferencias/  Consulta, importación y detalle de transferencias
    devoluciones/    Consulta e importación de devoluciones
    negativos/       Expedientes, fotografías y seguimiento
    inconsistencias/ Investigación, corrección y cierre
    facturacion/     Observaciones a los facturadores
    metrics/         Indicadores
    panel/           Preparación de datos para las páginas
    sync/            Consultas automáticas a SQL Server y carga en PostgreSQL
shared/              Contratos TypeScript, catálogos y reglas puras
app/                 Adaptadores de Next.js: páginas, layout y rutas /api
public/              Archivos públicos (favicon)
scripts/             Arranque del servidor, red (Tailscale, HTTPS) y verificaciones del proyecto
tests/
  backend/           Servicios, rutas API e integración con PostgreSQL
  shared/            Reglas puras y catálogos
  frontend/          Recorridos en el navegador
docker/              Imagen y configuración de PostgreSQL
```

`app/`, `public/` y los archivos de configuración (`package.json`, `next.config.ts`,
`tsconfig.json`, `prisma.config.ts`) se quedan en la raíz porque Next.js y Prisma
los buscan ahí.

## Recorrido de una operación

1. La interfaz en `frontend/` solicita una ruta del mismo dominio, por ejemplo
   `/api/inventario`.
2. `app/api/` delega en `backend/http/`, conservando método y dirección.
3. El controlador valida sesión, origen y permisos y llama al servicio del módulo.
4. El servicio aplica las reglas de negocio y utiliza `backend/src/db.ts`.
5. PostgreSQL persiste los cambios; la respuesta vuelve a la interfaz.

Las páginas autenticadas preparan sus datos iniciales mediante
`backend/src/panel/bootstrap.ts`. Las consultas ya no pertenecen a `app/page.tsx`.
Las cookies, las comprobaciones CSRF y los alcances regionales se conservan.

## Límites de dependencia

- `@frontend/*` apunta a `frontend/*` y puede usar `@shared/*`.
- `@backend/*` apunta a `backend/src/*`.
- `@backend-http/*` apunta a `backend/http/*`.
- `@shared/*` apunta a `shared/*`.
- El frontend no puede importar servicios, Prisma, módulos nativos de Node ni
  variables de entorno del servidor.
- El backend no depende de componentes visuales.
- `shared/` contiene código ejecutable independiente del servidor. Algunos contratos
  infieren tipos del backend y Prisma mediante `import type`; TypeScript elimina esas
  referencias al compilar y no incorpora esos módulos al navegador.

`npm run check:architecture` verifica estos límites; también se ejecuta en lint y build.
`server-only` sigue protegiendo los módulos sensibles frente a importaciones cliente.

## Conexión con SQL Server

PostgreSQL sigue siendo la base operativa de PDMC. SQL Server se lee
exclusivamente desde el backend y en solo lectura; el navegador sigue llamando a
las mismas API. Los detalles de operación están en `docs/sincronizacion-sqlserver.md`.

`backend/src/sync/` ejecuta las consultas de `backend/sqlserver/consultas/` y
entrega las filas a los servicios de cada módulo, que aplican sus validaciones y
transacciones:

| Fuente | Servicio | Entrada |
| --- | --- | --- |
| Inventario | `backend/src/inventario/service.ts` | `InventoryService.import()` |
| Transferencias | `backend/src/transferencias/consulta.ts` | `TransferQueryService.import()` |
| Devoluciones | `backend/src/devoluciones/service.ts` | `ReturnsService.import()` |
| Tiendas | `backend/src/tienda/catalogo.ts` | `importStoreCatalog()` |
| Facturadores | `backend/src/facturacion/catalogo.ts` | `importBillerCatalog()` |

## Ejecución y despliegue

Los comandos se ejecutan desde la raíz, igual que antes:

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Para desarrollo: `npm run dev`. Para validar:

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

`DATABASE_URL` y las variables existentes permanecen en el entorno privado del
servidor. No se requiere migración adicional por mover el código.

Esta separación es de código y responsabilidades; todavía no hay dos servidores
independientes. Se conserva un solo despliegue para mantener la operación actual.
