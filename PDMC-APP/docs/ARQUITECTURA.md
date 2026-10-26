# Organización de PDMC

PDMC mantiene un monolito modular con Next.js y TypeScript. Frontend y backend
tienen carpetas y responsabilidades separadas, con un único proceso y dominio.
Esta reorganización no modifica las tablas, los datos ni las rutas públicas.

## Estructura

```text
frontend/
  components/        Interfaz de cada módulo y componentes visuales
  hooks/             Estado e interacción del navegador
  styles/            Estilos globales y temas
backend/
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
shared/              Contratos TypeScript, catálogos y reglas puras
app/                 Adaptadores de Next.js: páginas, layout y rutas /api
prisma/              Esquema y migraciones PostgreSQL versionadas
scripts/             Administración, importadores y verificaciones
tests/               Pruebas de reglas, integración y permisos
```

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

## Conexión futura con la base principal

PostgreSQL sigue siendo la base operativa de PDMC. La lectura corporativa de SQL
Server se implementará exclusivamente dentro del backend y se invocará desde los
servicios; el navegador seguirá llamando a las mismas API.

Los puntos actuales de entrada son:

| Fuente | Servicio existente | Entrada actual |
| --- | --- | --- |
| Inventario | `backend/src/inventario/service.ts` | `InventoryService.import()` |
| Transferencias | `backend/src/transferencias/consulta.ts` | `TransferQueryService.import()` |
| Devoluciones | `backend/src/devoluciones/service.ts` | `ReturnsService.import()` |

Actualmente estas entradas reciben archivos y aplican validaciones y transacciones.
La integración corporativa deberá reutilizar las reglas del módulo al incorporar
filas desde SQL Server. Esta reorganización no instala un controlador SQL Server,
no abre conexiones corporativas y no necesita nuevas credenciales.

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
