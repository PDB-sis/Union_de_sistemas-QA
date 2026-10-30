# Organización de PDMC

PDMC está dividido en **tres paquetes independientes**, como `CYSN_QA` (NEXO QA):

- **backend:** la API.
- **frontend:** la interfaz.
- **contratos:** los tipos y reglas que comparten los dos.

Cada paquete tiene su propio `package.json`, su configuración de TypeScript y de lint, y sus pruebas. Se puede modificar, compilar y desplegar sin tocar el otro, siempre que se respete el contrato HTTP.

La separación no cambió las tablas ni los datos. Las rutas públicas son las mismas (`/`, `/tienda`, `/administracion`, `/login`, `/cambiar-contrasena` y `/api/...`), y se agregó una sola ruta de API nueva, `GET /api/panel`, que se explica más abajo.

## Estructura

```text
PDMC-APP/
├── backend/                 pdmc-backend — API HTTP (Node + Hono + Prisma)
│   ├── src/
│   │   ├── server.ts        Servidor: monta las rutas de src/http y, opcionalmente, sirve el frontend compilado
│   │   ├── env.ts           Variables de entorno (backend/.env.local)
│   │   ├── http/            Rutas por módulo, con la firma estándar (Request, { params }) → Response
│   │   ├── auth/            Sesiones, autorización y contraseñas
│   │   ├── admin/           Usuarios, ubicaciones y restablecimiento protegido
│   │   ├── inventario/      Validación e importación de inventario
│   │   ├── transferencias/  Consulta e importación de transferencias
│   │   ├── devoluciones/    Consulta e importación de devoluciones
│   │   ├── negativos/       Expedientes, fotografías y seguimiento
│   │   ├── inconsistencias/ Investigación, corrección y cierre
│   │   ├── facturacion/     Observaciones a los facturadores
│   │   ├── metrics/         Indicadores
│   │   ├── panel/           Datos iniciales de cada espacio (GET /api/panel)
│   │   ├── tienda/          Panel de tienda
│   │   └── sync/            Consultas a SQL Server y carga en PostgreSQL
│   ├── prisma/              Esquema, migraciones versionadas y datos iniciales
│   ├── generated/           Cliente de Prisma (se genera; no se versiona)
│   ├── scripts/             Usuarios, sincronización con SQL Server y comprobaciones
│   ├── sqlserver/           Consultas de solo lectura (copias de consultaPDMC)
│   ├── tests/               Unitarias (*.test.mjs) e integración con PostgreSQL (*.integration.mjs)
│   └── .env.example         Variables del backend (se copia como backend/.env.local)
├── frontend/                pdmc-frontend — interfaz (Vite + React + React Router)
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx         Arranque y rutas de la aplicación
│   │   ├── pages/           Páginas: piden sus datos a la API y navegan según la respuesta
│   │   ├── components/      Interfaz de cada módulo y componentes visuales (shadcn)
│   │   ├── hooks/, lib/     Estado del navegador, paleta, imágenes compartibles
│   │   └── styles/          Estilos globales y temas
│   ├── public/              Favicon
│   └── tests/               Unitarias del navegador
├── contratos/               @pdmc/contratos — compartido, sin servidor ni interfaz
│   ├── src/                 Tipos de las respuestas HTTP, catálogos y reglas puras
│   └── tests/
├── tests/e2e/               Pruebas de navegador de punta a punta (backend + frontend)
├── scripts/                 Arranque en red/Tailscale, HTTPS local, verificación de arquitectura y textos
├── docker/                  PostgreSQL local
└── docs/
```

La raíz es un *workspace* de npm: un `npm ci` instala los tres paquetes, y `@pdmc/contratos` queda enlazado para los otros dos. Los comandos de la raíz son solo atajos.

## Cómo se comunican

```text
Navegador ── frontend (HTML/JS estático) ──► /api/... ──► backend ──► PostgreSQL
                                                          └─► SQL Server (solo lectura, sincronización)
```

1. El frontend es una aplicación estática: no ejecuta código en el servidor y no lee variables de entorno.
2. Todo lo que necesita lo pide a `/api/...` en **el mismo dominio**. La sesión viaja en una cookie `HttpOnly`, y el backend solo acepta operaciones que vienen de sus orígenes configurados (`PDMC_AUTH_ORIGIN` y `PDMC_AUTH_ADDITIONAL_ORIGINS`).
3. El backend valida la sesión, el origen y los permisos, aplica las reglas de negocio y responde con el sobre `{ ok, data }` o `{ ok: false, error }`.

### Datos iniciales de las páginas: `GET /api/panel`

Antes, Next.js preparaba los datos de cada página en el servidor. Ahora cada página los pide al cargarse:

| Página | Petición | Respuesta (`contratos/src/panel.ts`) |
|---|---|---|
| `/` | `GET /api/panel?vista=inicio` | Datos del panel, usuario y permisos. Si el usuario no corresponde a esta página, `{ redirigir: "/administracion" \| "/tienda" }`. |
| `/tienda` | `GET /api/panel?vista=tienda` | Usuario y datos de la tienda |
| `/administracion` | `GET /api/panel?vista=administracion` | Usuario y qué puede administrar o auditar |
| `/cambiar-contrasena` | `GET /api/auth/sesion` | Usuario; responde aunque la contraseña sea temporal |

Si la respuesta es **401**, la página lleva al inicio de sesión. Si es **403** con el código `CAMBIO_PASSWORD`, lleva a cambiar la contraseña.

## Límites entre paquetes

`npm run check:architecture` verifica estos límites, y también corre en `lint` y en `build`:

- Ningún paquete importa archivos de otro por ruta relativa. Lo compartido se importa como `@pdmc/contratos/<ruta>`.
- **frontend:** no puede importar el backend, Prisma, `pg`, Hono, módulos de Node ni `process.env`.
- **contratos:** no puede depender del servidor ni de la interfaz.
- **backend:** no puede depender de la interfaz.

### El contrato HTTP

Las respuestas que comparten los dos lados están escritas de forma explícita en `contratos/src/`, por ejemplo `negativos/contracts.ts` y `panel.ts`. Ya no se deducen del código del servidor.

Para que el contrato no se desactualice, el backend comprueba al compilar que sus respuestas lo cumplen (`backend/src/negativos/contracts.check.ts`). Si alguien cambia una respuesta del backend sin actualizar el contrato, `npm run typecheck` falla.

**Regla práctica:**
- Si un cambio de backend no cambia la forma de las respuestas, el frontend no se toca.
- Si un cambio visual no necesita datos nuevos, el backend no se toca.
- Cuando sí cambia una respuesta, se actualiza su tipo en `contratos/` y los dos lados lo ven.

## Conexión con SQL Server

PostgreSQL es la base operativa. SQL Server se lee solo desde el backend y en solo lectura; la guía está en `docs/sincronizacion-sqlserver.md`.

`backend/src/sync/` ejecuta las consultas de `backend/sqlserver/consultas/` y entrega las filas a los servicios de cada módulo:

| Fuente | Servicio | Entrada |
| --- | --- | --- |
| Inventario | `backend/src/inventario/service.ts` | `InventoryService.import()` |
| Transferencias | `backend/src/transferencias/consulta.ts` | `TransferQueryService.import()` |
| Devoluciones | `backend/src/devoluciones/service.ts` | `ReturnsService.import()` |
| Tiendas | `backend/src/tienda/catalogo.ts` | `importStoreCatalog()` |
| Facturadores | `backend/src/facturacion/catalogo.ts` | `importBillerCatalog()` |

## Desarrollo

```sh
npm ci                          # instala los tres paquetes
cp backend/.env.example backend/.env.local   # y completar DATABASE_URL, PDMC_AUTH_ORIGIN…
npm run db:migrate -w backend
npm run dev:backend             # API en http://127.0.0.1:3000
npm run dev:frontend            # interfaz en http://localhost:5173 (reenvía /api al backend)
```

Validación completa, desde la raíz:

```sh
npm run lint                    # lint de los tres paquetes, arquitectura y textos
npm run typecheck
npm test                        # unitarias de los tres paquetes
npm run test:integration        # backend contra PostgreSQL (esquemas aislados)
npm run build                   # frontend compilado y tipos del backend
npm run test:browser            # punta a punta en Edge (requiere build)
```

Cada paquete también tiene sus propios comandos, por ejemplo `npm test -w contratos` o `npm run lint -w frontend`.

## Despliegue

Hay dos formas de publicar PDMC:

1. **Un solo proceso**, como hasta ahora. `npm run build` y luego `npm start` levantan la API sirviendo también `frontend/dist` en el mismo puerto (por defecto el 3000; se cambia con `PORT` y `PDMC_HOST`). Así funcionan `scripts/iniciar-pdmc-tailscale.ps1`, `scripts/iniciar-pdmc-red.ps1` y la imagen `docker/pdmc` del repositorio.
2. **Por separado.** `frontend/dist` se publica en cualquier servidor estático (Netlify, Caddy, nginx), y `/api/*` se reenvía al backend **en el mismo dominio**, porque la sesión es una cookie del dominio. El backend se arranca sin `--frontend`.

### Cambios en un servidor existente

Lo que cambia respecto del despliegue con Next.js:

- **Configuración:** el `.env.local` pasa a `backend/.env.local`. Mientras no se mueva, el backend sigue leyendo `PDMC-APP/.env.local`.
- **Arranque:** `next start` se reemplaza por `npm start` desde `PDMC-APP/`, o por `node --import tsx src/server.ts --frontend` desde `PDMC-APP/backend`.
- **Sincronizador:** desde `PDMC-APP/backend`, `npm run sync:sqlserver`, o `node --import tsx scripts/sincronizar-sqlserver.ts`.
- **Migraciones y scripts:** se ejecutan con `-w backend`, por ejemplo `npm run db:migrate -w backend`.
- **Respaldos del restablecimiento protegido:** pasan a `backend/backups/`.
