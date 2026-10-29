# Contexto del proyecto: Unión de Sistemas QA

> Documento de referencia para personas y agentes que trabajen en este espacio.
> Última revisión: 2026-10-28 (fases 1 a 4 del agente multisitio en marcha con MARACAIBO y CREACION; frontends en Netlify; auditoría de seguridad en la sección 7; agentes de Claude Code en la sección 8).

---

## 1. Descripción del proyecto

**Unión de Sistemas QA** es el espacio de trabajo donde se integran dos sistemas internos de la empresa sobre una sola base PostgreSQL (`sistemas_unificados`):

| Sistema | Qué es | Problema que resuelve |
|---|---|---|
| **PDMC — Panel de Mejora Continua** (`PDMC-APP/`) | Aplicación web empresarial (Next.js) | Centraliza transferencias, devoluciones, inventario, negativos, inconsistencias, facturación, etiquetado, pedidos y reportes de tiendas. Sustituye las cargas manuales de CSV por consultas automáticas de solo lectura a SQL Server corporativo. |
| **CYSN QA / NEXO QA** (`CYSN_QA/`) | API FastAPI + frontend React (Vite) + agente Windows por tienda | Control de calidad de inventario: compara la base de creación de productos (`CREACION`) con el inventario real de cada sucursal, detecta diferencias, gestiona ciclos QA y correcciones. Sustituye un flujo anterior de n8n. |

Ambos sistemas comparten:
- **Base unificada** con un esquema por sistema: `pdmc` y `cysn_qa`.
- **Acceso único (SSO)**: PDMC emite un JWT de un solo uso que CYSN QA canjea (`/api/qa-sso` en PDMC → intercambio en CYSN).
- **Origen corporativo** en SQL Server, siempre consultado en **solo lectura**. Desde el 2026-10-26 los datos llegan a PostgreSQL **solo por los agentes** de cada sitio; la única excepción es el catálogo de sitios (`BODEGA_DATOS`).

---

## 2. Arquitectura y tecnologías

### Vista general

```text
SQL Server de cada sitio (solo lectura)                          SQL Server central
  Bodega       GDC_CASA_MATRIZ (MARACAIBO 2004, SERVERSQL\SQL2005)   BODEGA_DATOS.tbDimTiendas
  PC creación  CREACION        (2010, SERVERSQL\SQLSERVER2005)            │ solo lectura
  Tienda       BD_SPDV                                                    │
        │                                                                ▼
 Agente NexoQAAgenteTienda (servicio Windows por sitio)           Sincronizador PDMC (SUCURSALES)
        │ HTTPS + token → apiqa.apipalacio.com/api/agente/v1              │
        ▼                                                                ▼
 API CYSN (127.0.0.1:5082) ─► cysn_qa.agente_fila / inventario_agente_actual
                                   ├─► Sincronizador PDMC ─► esquema pdmc (transferencias, devoluciones,
                                   │                          facturadores, inventario)
                                   └─► Worker app.sync.creacion ─► cysn_qa.creacion
 PostgreSQL 18 ── base `sistemas_unificados` (esquemas `pdmc` y `cysn_qa`)

Navegador ─► Netlify: sistemaunionqa (reenvía a PDMC) · nexoqa-pdb (NEXO QA) ─► Caddy (HTTPS) ─► PDMC 5083 / API 5082
```

### PDMC-APP

- **Lenguaje:** TypeScript (Node.js 22).
- **Framework:** Next.js **16.3.6** (App Router, Turbopack) + React 19. ⚠️ Esta versión de Next tiene cambios incompatibles con versiones anteriores: consultar `node_modules/next/dist/docs/` antes de escribir código (ver `PDMC-APP/AGENTS.md`).
- **Base de datos:** PostgreSQL 17 vía **Prisma 7.10** (`@prisma/adapter-pg`, `pg`). Cliente generado en `generated/`.
- **SQL Server:** `mssql` (solo lectura, transacciones que siempre se revierten).
- **UI:** Tailwind CSS 4, shadcn/ui, Radix UI, Base UI, lucide-react, Recharts, sonner.
- **Formularios y validación:** react-hook-form + zod.
- **Pruebas:** `node --test` con `tsx`; PGlite para pruebas de base de datos.
- **Arquitectura:** monolito modular con un único proceso y despliegue:
  - `frontend/` → interfaz (componentes, hooks, estilos).
  - `backend/http/` → controladores de rutas HTTP; `backend/src/` → servicios de negocio por módulo (`auth`, `admin`, `inventario`, `transferencias`, `devoluciones`, `negativos`, `inconsistencias`, `facturacion`, `metrics`, `panel`).
  - `shared/` → contratos TypeScript, catálogos y reglas puras.
  - `app/` → adaptadores de Next.js (páginas y `/api/*` que delegan en `backend/http/`).
- **Flujo de una petición:** interfaz → `/api/...` → `backend/http/` (sesión, origen/CSRF, permisos) → servicio en `backend/src/` → `backend/src/db.ts` → PostgreSQL.
- **Servidor de producción:** `scripts/servidor-pdmc.mjs` (HTTPS si se configuran `PDMC_TLS_PFX_FILE` y `PDMC_TLS_PASSWORD_FILE`).

### CYSN_QA (NEXO QA)

- **Backend:** Python 3.11+ · FastAPI · Uvicorn · SQLAlchemy 2 · psycopg 3 · PyJWT · pwdlib · pyodbc (ODBC Driver 18). Dependencias de producción en `deployment/requirements-qa-production.txt`.
  - `app/main.py` contiene la mayoría de los endpoints (~50); `app/routers/agente_tienda.py` recibe los envíos de los agentes.
  - `app/models/` (ORM), `app/schemas/` (Pydantic), `app/services/` (motores de ciclo e importación QA), `app/sync/` (sincronización `CREACION` desde SQL Server).
  - El esquema se elige con `CYSN_POSTGRES_SCHEMA` (se aplica como `search_path`).
- **Frontend:** React 19 + TypeScript + Vite 8. Vistas en `src/views/`, llamadas a la API en `src/services/` (`VITE_API_URL`).
- **Agente de tienda** (`CYSN_QA/agente_tienda/`): servicio Windows en Python (empaquetado con PyInstaller). Lee `BD_SPDV` en solo lectura y envía cambios incrementales por HTTPS con token por sucursal; reconciliación completa cada 24 h; cursor persistido en SQLite.
- **Migraciones:** SQL manuales con pares `*_up.sql` / `*_down.sql` en `backend/migrations/`.

### Infraestructura (`deployment/`)

- **Servidor:** Windows, carpeta `C:\Users\Administrator\Documents\servicios IAN\ServicioQA\` (`PDMC-APP\` y `CYSN_QA\backend\`). Es un servidor **compartido**: `Inicio-servicios-IAN.bat` arranca 12 servicios (precio, precio Margarita, Exporter, ExporterCompras, Tasa, pdbStore, rotación, servicio China y, en los pasos 9 a 12, NEXO QA, PDMC, el sincronizador de PDMC y el worker de CREACION). Al empezar detiene todos los procesos con PID guardado.
  - ⚠️ El `.bat` con el que se arranca el servidor **no es** el de `ServicioQA\deployment\`, sino otra copia; el 2026-10-28 se le añadió a mano el paso 12. Si se cambia el `.bat` del proyecto, hay que copiarlo también sobre esa copia.
- **Procesos de este proyecto en el servidor:**
  - API QA: Uvicorn en `127.0.0.1:5082`; logs en `CYSN_QA\backend\logs\qa-api.*.log`.
  - PDMC: `next start -H 127.0.0.1 -p 5083`; logs en `PDMC-APP\logs\pdmc.*.log`. No usa `npm start`, porque `servidor-pdmc.mjs` exige el 443, que es de Caddy.
  - Sincronizador PDMC: módulos `SUCURSALES,FACTURADORES,TRANSFERENCIAS,DEVOLUCIONES,INVENTARIO`. Solo `SUCURSALES` lee SQL Server; el resto lee lo que envían los agentes. Logs en `PDMC-APP\logs\sync.*.log`.
  - Worker CREACION (paso 12): `python -m app.sync.creacion --loop` con `CYSN_CREACION_FUENTE=AGENTE` y `CYSN_CREACION_DIM_ID=2010`, variables puestas en el propio `.bat`. PID en `pids\nexoqa-creacion.pid` y registro en `CYSN_QA\backend\logs\creacion.*.log`.
- **Caddy** publica los dos sistemas en un solo dominio, `apiqa.apipalacio.com`:
  - `/api/agente/*` y `/api/health` → API QA (5082), sin prefijo, para no reconfigurar las tiendas.
  - `/qa/*` → API QA, quitando el prefijo (`/qa/api/auth/login` llega como `/api/auth/login`).
  - Todo lo demás → PDMC (5083).
  - El Caddyfile real (`Servidor/deployment/caddy/Caddyfile`) contiene también `api`, `api2`, `api3` y `api4`: el bloque `Caddyfile.apiqa` se **fusiona**, no se copia encima.
- **Netlify** (desde el 2026-10-27). Los dos sitios están conectados a `PDB-sis/Union_de_sistemas-QA`, rama `main`:
  - `https://sistemaunionqa.netlify.app` → **PDMC, la entrada principal**. Base directory `deployment/netlify-pdmc`, que solo tiene un `netlify.toml` que reenvía todo a `https://apiqa.apipalacio.com`. PDMC sigue ejecutándose en el servidor; no se puede separar porque sus páginas se generan en el servidor con Prisma. Límite: Netlify corta las peticiones reenviadas que tardan más de unos 26 s.
  - `https://nexoqa-pdb.netlify.app` → **NEXO QA**. Base directory `CYSN_QA/frontend` (su `netlify.toml` fija Node 22, `dist` y la redirección de la SPA) y `VITE_API_URL=https://apiqa.apipalacio.com/qa`.
  - En el servidor: `PDMC_AUTH_ADDITIONAL_ORIGINS=https://sistemaunionqa.netlify.app` y `PDMC_QA_SSO_DESTINATION=https://nexoqa-pdb.netlify.app` en `PDMC-APP\.env.local`, y `CYSN_CORS_ORIGINS=https://nexoqa-pdb.netlify.app` en `CYSN_QA\backend\.env`. Las tres líneas están también en `Servidor/`, para que coincidan. Si cambia una dirección de Netlify, hay que cambiarla en los dos sitios y reiniciar.
- Scripts PowerShell para crear la base unificada y levantar el backend QA.
- Docker: instalación completa con `compose.yaml` e imágenes `sistemaspdb/*` (sección 5.5). PDMC local puede seguir usando su propio PostgreSQL 17 en Docker.

### Versiones de PostgreSQL

| Entorno | Versión | Evidencia |
|---|---|---|
| PDMC local (Docker) | **17** | `PDMC-APP/docker/postgres/Dockerfile` (`FROM postgres:17`); `backups/unificada/01_pdmc_estructura.sql` volcado desde 17.11 |
| CYSN QA y base unificada `sistemas_unificados` | **18** | `02_cysn_qa_estructura.sql`, `cysn_qa_datos_*.sql` volcados desde 18.6; `Crear-Base-Unificada.ps1` sugiere `PostgreSQL\18\bin` |

- El destino de la base unificada es **PostgreSQL 18**; usar herramientas cliente 18 (`pg_dump`, `pg_restore`, `psql`), que también pueden conectarse a servidores 17.
- Un volcado hecho con `pg_dump` 18 en formato personalizado (`.dump`) puede no restaurarse en un servidor 17: no restaurar respaldos de la base unificada en el Docker local de PDMC.
- Pendiente de confirmar: versión exacta instalada en el servidor de producción.

---

## 3. Convenciones y estándares de código

### Generales
- **Idioma:** nombres de dominio, mensajes, documentación y commits en **español** (p. ej. `TransferQueryService.import()` convive con carpetas `transferencias/`, `negativos/`). Los mensajes al usuario siempre en español.
- **Codificación UTF-8 estricta:** `npm run check:texts` rechaza mojibake (`Ã`, `Â`, `â`, `�`), signos `?` dentro de palabras y escapes `\uXXXX` visibles en atributos JSX.
- Commits en español, en imperativo y descriptivos (ej.: *"Actualizar transferencias solo con INSERT, UPDATE y baja lógica"*).

### PDMC (TypeScript)
- **ESLint 9** con `eslint-config-next` (`eslint.config.mjs`) + `tsc --noEmit` en modo estricto.
- **Límites de capas obligatorios** (verificados por `npm run check:architecture`, que corre en `lint` y `build`):
  - Alias: `@frontend/*`, `@backend/*` (→ `backend/src`), `@backend-http/*`, `@shared/*`.
  - `frontend/` **no** puede importar `backend/`, Prisma, `pg`, `server-only`, módulos nativos de Node ni leer `process.env`.
  - `shared/` solo puede referenciar tipos del servidor con `import type`.
  - `backend/` no depende de `frontend/`.
  - Solo el backend lee variables de entorno.
- Módulos sensibles marcados con `import "server-only"`.
- **Nunca** usar variables `NEXT_PUBLIC_` para conexiones o secretos.
- Patrones: servicios por módulo con validación + transacción; controladores delgados; reglas puras en `shared/`.

### CYSN QA (Python / React)
- Python con *type hints*, Pydantic para entrada/salida y SQLAlchemy ORM declarativo.
- Frontend con ESLint 10 + `typescript-eslint`, `eslint-plugin-react-hooks` y `react-refresh`.
- Valores numéricos de inventario con `Decimal` (no `float`).

---

## 4. Estructura del repositorio

El directorio raíz **no** es un repositorio git; contiene varios repositorios y material de soporte.

```text
Union de sistemas QA/
├── PDMC-APP/              ★ Repo principal de PDMC (github.com/controldeinconsistencias-code/PDMC-APP)
│   ├── app/               Páginas y rutas /api de Next.js (adaptadores)
│   ├── frontend/          Componentes, hooks y estilos
│   ├── backend/http/      Controladores HTTP por módulo (incluye qa-sso/)
│   ├── backend/src/       Servicios de negocio + db.ts (sync/ = sincronización)
│   ├── backend/prisma/    schema.prisma y migraciones versionadas
│   ├── backend/sqlserver/ Consultas de solo lectura y scripts para el DBA
│   ├── backend/scripts/   Sincronizador, usuarios y comprobaciones de la base
│   ├── shared/            Contratos y reglas puras
│   ├── scripts/           Arranque del servidor, red y verificadores del proyecto
│   ├── tests/             backend/, shared/ y frontend/ (*.test, *.integration, *.browser)
│   ├── docker/            Imagen y compose.yaml de PostgreSQL de PDMC
│   └── docs/              ARQUITECTURA.md, sincronizacion-sqlserver.md, sesiones…
├── CYSN_QA/               ★ Repo de NEXO QA (github.com/adolfolinares2121-afk/CYSN_QA)
│   ├── backend/           API FastAPI (app/, migrations/, scripts/, tests/, docs/)
│   ├── frontend/          SPA React + Vite
│   ├── agente_tienda/     Agente Windows por sucursal
│   └── aportes/           Material de referencia (export de n8n, consultas originales)
├── consultaPDMC/          Consultas SQL Server originales (fuente de verdad de backend/sqlserver/consultas/)
├── deployment/            Crear-Base-Unificada.ps1, Aplicar-Migracion-CYSN.ps1, Iniciar-Backend-QA.ps1,
│                          Revisar-Datos-Bodega.ps1, exportar_github.py, caddy/, netlify-pdmc/, requirements
├── docker/ + compose.yaml Imágenes de Docker Hub (sección 5.5)
├── backups/               Dumps de estructura y unificada/ (scripts 00–03 de la base unificada)
├── logs/                  Logs de ejecución de PDMC y CYSN
└── Servidor/              Paquete que se despliega en el servidor (ver abajo)
    ├── PDMC-APP/          Copia completa de PDMC-APP (sin .git ni node_modules)
    ├── CYSN_QA/           Solo backend/, agente_tienda/ y aportes/ (sin frontend)
    ├── deployment/        Igual que deployment/ + lanzadores del servidor (Iniciar-PDMC.cmd,
    │                      Iniciar-API-QA.cmd, Inicio-servicios-IAN.bat) y caddy/Caddyfile real
    └── backups/unificada/ Scripts 00–03 de la base unificada
```

> Se desarrolla **solo** en **`PDMC-APP/`** y **`CYSN_QA/`**. `Servidor/` es el resultado que se copia al servidor: no se edita a mano, se actualiza copiando desde los proyectos reales.
>
> - **CYSN QA:** al servidor va únicamente el backend (y el agente). El frontend React se compila con `npm run build` y se publica aparte.
> - **PDMC:** no se puede enviar solo el backend. Es Next.js: páginas y `/api/*` forman un único proceso y un único `npm run build`, así que `frontend/` debe ir también al servidor.
>
> El 2026-10-21 se eliminaron las copias históricas (`PDMC-APP-prueba/`, `compañero/`, `Servidor_respaldo_20261015/`). Todos sus commits ya estaban en `PDMC-APP`.
>
> A fecha de 2026-10-23 siguen en la raíz:
> - `Servidor.rar` (55 MB, del 2026-10-22): una copia nueva del paquete que **contiene los secretos de producción** (ver sección 7).
> - `.integracion-pdmc/`, que solo tiene `node_modules`.
>
> ⚠️ El paquete `Servidor/` lleva hoy cosas que no deberían viajar: los `.env` con secretos, las carpetas `.git` de los dos repositorios (con el historial del `.env` de CYSN), `PDMC-APP/.secrets/`, `CYSN_QA/aportes`, `tests` y `.pytest_cache`. Además, `Servidor/backups/unificada/04_cysn_qa_catalogos.sql` no existe en `backups/unificada/` e inserta 3 usuarios con hash, entre ellos la cuenta de prueba `usuario_tienda_prueba`.

---

## 5. Flujo de trabajo y comandos clave

### 5.1 PDMC-APP — entorno local

Requisitos: Node.js 22, npm, Docker (o PostgreSQL 17).

```powershell
cd PDMC-APP
npm ci

# Secreto de PostgreSQL y contenedor (puerto local 127.0.0.1:55432)
New-Item -ItemType Directory -Force .secrets
Set-Content -LiteralPath .secrets\postgres-password -Value "CLAVE_SEGURA" -NoNewline
docker compose --file docker/compose.yaml up -d

Copy-Item .env.example .env.local   # completar DATABASE_URL y PDMC_AUTH_ORIGIN
npm run db:migrate                  # prisma migrate deploy (nunca migrate reset)
npm run db:check

# Primer administrador (variables temporales; retirarlas después)
$env:PDMC_SEED_ADMINISTRADOR_EMAIL="..."; $env:PDMC_SEED_ADMINISTRADOR_NOMBRE="..."; $env:PDMC_SEED_ADMINISTRADOR_PASSWORD="..."
npm run crear-usuarios-iniciales

npm run dev                         # desarrollo
```

**Validación (lo mismo que ejecuta GitHub Actions):**

```powershell
npm run lint              # ESLint + check:architecture + check:texts
npm run typecheck
npm test                  # tests/**/*.test.mjs
npm run test:integration  # tests/**/*.integration.mjs (requiere PostgreSQL)
npm run build
```

**Sincronización con SQL Server:**

```powershell
npm run sync:crear-usuario     # cuenta de sistema sin contraseña (PDMC_SYNC_USUARIO_EMAIL)
npm run sync:sqlserver:once    # una vuelta; filtrar con PDMC_SYNC_MODULOS=TRANSFERENCIAS
npm run sync:sqlserver         # ciclo continuo
```

**Producción:** `npm run build` → `npm start` (o `scripts/iniciar-pdmc-red.ps1` / `iniciar-pdmc-tailscale.ps1`).

Otros: `db:status`, `db:audit`, `administrar-usuario`, `administrar-accesos`.

### 5.2 CYSN_QA — entorno local

```powershell
# Backend
cd CYSN_QA\backend
python -m venv .venv
.venv\Scripts\pip install -r ..\..\deployment\requirements-qa-production.txt
# configurar backend\.env (DATABASE_*, CYSN_POSTGRES_SCHEMA, JWT_SECRET_KEY, CYSN_SQLSERVER_*, CYSN_PDMC_SSO_SECRET)
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 5082 --reload
# Salud: GET http://127.0.0.1:5082/api/health

# Worker de sincronización CREACION. Fuente: CYSN_CREACION_FUENTE=AGENTE (lo que envía el
# agente del sitio CYSN_CREACION_DIM_ID, por defecto 2010) o SQLSERVER (conexión directa, la anterior)
.venv\Scripts\python -m app.sync.creacion --loop --intervalo 60

# Pruebas (162). Las 26 de integración de CREACION necesitan una base desechable cuyo nombre contenga "test":
#   $env:CYSN_SYNC_POSTGRES_SCHEMA='public'; $env:CYSN_TEST_DATABASE_URL='postgresql+psycopg://postgres:CLAVE@127.0.0.1:PUERTO/cysn_qa_test'
.venv\Scripts\python -m pytest tests

# Frontend
cd ..\frontend
npm ci
npm run dev        # Vite (http://localhost:5173), VITE_API_URL en .env
npm run lint
npm run build
```

### 5.3 Base unificada

```powershell
# Respalda pdmc, cysn_qa y el destino; crea sistemas_unificados vacía con esquemas pdmc y cysn_qa
.\deployment\Crear-Base-Unificada.ps1 -PgBin 'C:\Program Files\PostgreSQL\18\bin'
# Reemplazar un destino existente (solo explícitamente):
.\deployment\Crear-Base-Unificada.ps1 -RecrearDestino
```

Aplica `backups/unificada/00…03_*.sql` y adapta las migraciones de CYSN de `public.` a `cysn_qa.`. No copia datos de negocio: estos llegan por los sincronizadores.

### 5.5 Docker (instalación completa desde cero)

- **Qué hay:** `compose.yaml` en la raíz levanta cuatro imágenes publicadas en Docker Hub (`sistemaspdb/*`, públicas, sin datos ni secretos):
  - `postgres-unificada`: PostgreSQL 18 con los esquemas `pdmc` y `cysn_qa`, la estructura y **todas** las migraciones `*_up.sql` de CYSN (el Dockerfile las toma solas), y sus catálogos (roles y tipos de diferencia);
  - `pdmc`: la web, que aplica las migraciones al arrancar, y también el sincronizador;
  - `nexoqa-api`;
  - `nexoqa-web`: nginx, que reenvía `/api/` a la API.
- **Dónde está cada cosa:** los Dockerfiles en `docker/`, la guía en `DOCKER.md` y la configuración en `.env.example`, que se copia a `.env`.
- **Cómo se publica una versión:** desde el clon limpio de `Union_de_sistemas-QA`, `docker compose build` y después `docker compose push`, con `VERSION`. Para construir, `compose` exige `POSTGRES_PASSWORD`, `SSO_SECRET` y `NEXOQA_JWT_SECRET`; basta con valores de relleno, porque no quedan en las imágenes.
  - **Versiones publicadas:** `2026.10.26` y `2026.10.27` (esta también como `latest`). La `2026.10.27` lleva la fusión de PDMC (restablecimiento y fotografías) y `CYSN_CORS_ORIGINS`, pero **no** la fase 4 (migración 007 y worker con fuente `AGENTE`), que es del 2026-10-28.
- **Probado el 2026-10-26 desde cero:** migraciones, usuarios iniciales, inicio de sesión en los dos sistemas y una transferencia enviada por un agente hasta PDMC.
- **Comandos nuevos para Docker:** `python -m app.crear_administrador` crea el primer administrador de NEXO QA. El sincronizador de PDMC corre aunque `PDMC_SQLSERVER_ENABLED=false`, porque ese valor solo afecta al catálogo de sitios. Y si todavía no hay datos de ningún agente, la carga queda `SIN_CAMBIOS` con un aviso, no `FALLIDA`.
- **Hueco abierto:** sin acceso a `BODEGA_DATOS`, una instalación nueva no tiene catálogo de sitios, y no se pueden registrar agentes.

### 5.4 Despliegue en servidor

**Copia del paquete (siempre así):** borrar `C:\temp\Servidor`, copiar la carpeta `Servidor/` (sin comprimir) a `C:\temp\Servidor` y ejecutar:

```powershell
robocopy 'C:\temp\Servidor' 'C:\Users\Administrator\Documents\servicios IAN\ServicioQA' /E /XD .git .secrets __pycache__ .pytest_cache generated /XF .env .env.local config.env /NFL /NDL /NP
```

- **`generated` excluido:** `Servidor/PDMC-APP/generated` era un cliente Prisma viejo, del 2026-10-19, que pisaba el del servidor. El sincronizador falló con «Unknown argument `dimIdTienda`». Tras un despliegue con cambios en `schema.prisma`, hay que ejecutar en el servidor `npx prisma generate` en `PDMC-APP`.
- **`.env`, `.env.local` y `config.env` excluidos:** el 2026-10-27 el `robocopy` pisó los del servidor y se perdieron las líneas de Netlify. Los cambios de `.env` se hacen a mano en el servidor y también en `Servidor/`.
- **Comprobación:** códigos SHA-256 de los archivos cambiados y la columna ERROR del resumen en 0. Después, reiniciar con el `.bat` (ver sección 2).
- **Revisión de datos:** `deployment\Revisar-Datos-Bodega.ps1 [-DimId 2004]`. Solo lee. Muestra el último contacto del agente, los envíos, lo guardado en `cysn_qa`, la comparación con PDMC y el estado de las sincronizaciones de PDMC.

1. **Backend QA:** `deployment\Iniciar-Backend-QA.ps1 [-SincronizarCreacion]` (crea venv, instala dependencias, levanta Uvicorn en `127.0.0.1:5082`, verifica `/api/health`).
2. **Caddy:** añadir `deployment/caddy/Caddyfile.apiqa` al Caddyfile, `caddy validate` y `caddy reload`. Puertos 80/443 abiertos; backend solo en localhost.
3. **PDMC:** `npm ci && npm run db:migrate && npm run build && npm start` con `.env.local` del servidor.
4. **Agentes:** cada migración de CYSN se aplica con `deployment\Aplicar-Migracion-CYSN.ps1 -Migracion 00X_..._up.sql -PgBin 'C:\Program Files\PostgreSQL\18\bin'`. En el servidor están aplicadas de la 001 a la 007. Cada sitio se registra con `python -m app.agentes crear --dim-id <dimID> [--codigo ...]`, desde `CYSN_QA\backend`; muestra el token una sola vez. Después se sigue `CYSN_QA/agente_tienda/README.md`. El servicio del sitio se instala desde PowerShell **como administrador**; sin eso da «Acceso denegado (5)».

---

## 6. Reglas de negocio y restricciones

### Seguridad
- **Nunca** versionar `.env`, `.env.local`, `.secrets/`, certificados, `config.env` de agentes, respaldos (`.dump`), logs ni datos empresariales.
- Secretos solo del lado servidor; prohibido `NEXT_PUBLIC_` para conexiones o claves.
- `PDMC_AUTH_ORIGIN` debe coincidir con la URL pública exacta; HTTP solo para `localhost`.
- Se conservan cookies de sesión, verificación de origen/CSRF y **alcances regionales** por usuario.
- Contraseñas temporales: 12–128 caracteres, vencen en 48 h y deben cambiarse en el primer acceso.
- **SSO PDMC → CYSN:** JWT HS256, `iss=pdmc-app`, `aud=cysn-qa`, `typ=pdmc_sso`, vigencia ≤ 60 s, `jti` de un solo uso; secreto ≥ 32 caracteres (`PDMC_QA_SSO_SECRET` = `CYSN_PDMC_SSO_SECRET`). Roles permitidos por defecto: `ADMINISTRADOR`, `MEJORA_CONTINUA`.
- La API de CYSN escucha solo en `127.0.0.1`; la exposición pública es exclusivamente vía Caddy con HSTS.
- **Orígenes permitidos:** la API de CYSN acepta `localhost:5173` y los orígenes de `CYSN_CORS_ORIGINS` (separados por comas). PDMC acepta `PDMC_AUTH_ORIGIN` y los de `PDMC_AUTH_ADDITIONAL_ORIGINS` (HTTPS, sin ruta). Sin ellos, Netlify recibe CORS 400 o `ORIGEN` 403.

### SQL Server: siempre solo lectura
- Usuarios dedicados con únicamente `GRANT SELECT` (sin `db_datawriter`, `db_owner`, `EXECUTE` ni DDL).
- PDMC rechaza cualquier sentencia de escritura y ejecuta cada consulta en una transacción que siempre se revierte.
- CYSN aborta si el usuario puede escribir (`CYSN_SQLSERVER_REQUIRE_READONLY=true`).
- Los agentes de tienda usan un usuario SQL de solo lectura propio por sucursal y no abren puertos.
- Las consultas de `PDMC-APP/backend/sqlserver/consultas/` son **copias exactas** de `consultaPDMC/`: si se modifica una, actualizar la otra. Los nombres no coinciden; equivalencias:

  | `consultaPDMC/` (original) | `PDMC-APP/backend/sqlserver/consultas/` (copia) |
  |---|---|
  | `TRANSFERENCIAS NUEVAS.sql` | `transferencias.sql` |
  | `DEVOLUCIONES.sql` | `devoluciones.sql` |
  | `INVENTARIO PDMC.SQL` | `inventario.sql` |
  | `Sucursal - Info.sql` | `sucursales.sql` |
  | `Usuarios Activos.sql` | `facturadores.sql` |
  | `Reportes de Transferencias realizadas Maracaibo refinado - ACTUALIZADO.sql` | *(sin copia; no lo usa el sincronizador)* |

  Verificado el 2026-10-23:
  - Cuatro parejas son copias exactas byte a byte.
  - `facturadores.sql` difiere de `Usuarios Activos.sql` solo en los finales de línea: CRLF en la copia, LF en el original. El contenido es el mismo.
  - El sincronizador quita el BOM al leer (`backend/src/sync/ejecutar.ts`).
  - **`sucursales.sql`** lee `[BODEGA_DATOS].[dbo].[tbDimTiendas]` con `Status = 1`. Es el catálogo de sitios por `dimID_Tienda` (fase 1).
  - **`transferencias.sql`** toma el código de la tienda directamente (`t.codigoRecibe`), sin la lista fija de tiendas. Mantiene las 9 columnas con detalle por producto y caja.
  - **`devoluciones.sql`** trae **una fila por devolución**, sin detalle por producto: `Numero`, `fecha_formateada`, `CodNombre` (código del usuario), `usuario` (nombre), `codigoRecibe_Dletra`, `status`, `Observacion`, `TotalValor` (número, sin signo de moneda) y `DocumentoOrigen` (número de documento). La pantalla de devoluciones de PDMC dejó de mostrar el detalle de productos, unidades y la imagen; el detalle importado antes se conserva en `DevolucionConsultaDetalle`. Migración: `20261022120000_devoluciones_por_cabecera`.

### Sincronización de datos
- **Nunca borrar físicamente**: transferencias, devoluciones y `creacion` se actualizan solo con INSERT, UPDATE y **baja lógica** (`bajaEn`); se reactivan si reaparecen.
- **Una fila inválida rechaza toda la carga** del módulo; se conserva la información anterior y se reintenta en el siguiente ciclo (error en `SincronizacionEjecucion`).
- Si el resultado es idéntico al anterior, no se reimporta.
- CYSN aborta si el origen trae 0 filas o si las bajas superan `CYSN_SYNC_MAX_BAJAS_PORCENTAJE` (20 % por defecto).
- Duplicados de `CodigoBarra` en el origen: se conserva la última fila recibida y se informa el conteo.
- Orden de arranque PDMC: primero tiendas y facturadores, luego transferencias, devoluciones e inventario.
- Frecuencias por defecto: sucursales y facturadores 1 h, transferencias y devoluciones 1 min, inventario 15 min.
- **Inventario/negativos:** la carga automática no publica cortes; la fotografía semanal de negativos se publica a mano (máximo **2 por semana**). Sin un primer corte, la carga falla con `PRIMER_CORTE_REQUERIDO`.
- Las cargas automáticas de inventario se registran a nombre de una cuenta de sistema sin contraseña.

### Base de datos
- Migraciones PDMC versionadas con Prisma: usar `prisma migrate deploy`; **no** `migrate reset` en entornos con datos.
- Migraciones CYSN siempre con su par `_down.sql`.
- En la base unificada cada sistema usa su esquema (`pdmc`, `cysn_qa`); consultas que nombren `public.` deben adaptarse.
- `Crear-Base-Unificada.ps1` respalda antes de tocar nada y solo reemplaza el destino con `-RecrearDestino`.

### Datos iniciales
- Los catálogos empresariales no forman parte del repositorio. Crear primero regiones y luego tiendas (código corporativo único + nombre + región) desde **Administración → Entidades operativas**. El seed no crea datos de demostración.

### Puntos pendientes / a vigilar
- Puerto del backend QA: el valor vigente es **`5082`** (`Caddyfile.apiqa`, `Iniciar-Backend-QA.ps1` y `deployment/caddy/README.md`, corregido el 2026-10-19; antes decía `8001`).
- **Dominio público:** PDMC se sirve en la raíz de `https://apiqa.apipalacio.com` y en `https://sistemaunionqa.netlify.app`, y el frontend de QA en `https://nexoqa-pdb.netlify.app` (sección 2).
- **SSO PDMC → QA:** `PDMC_QA_SSO_DESTINATION=https://nexoqa-pdb.netlify.app`, configurado el 2026-10-27. **Falta probar** el botón de QA con un usuario real.
- **Usuarios de PDMC en el servidor (2026-10-27):** un administrador (estaba `INVITADO` con la contraseña temporal caducada) y la cuenta de sistema `sincronizacion@pdmc.local`. La contraseña temporal se repone con `npm run administrar-usuario` (`PDMC_ADMIN_ACTOR_EMAIL`, `PDMC_ADMIN_USUARIO_EMAIL`, `PDMC_ADMIN_MOTIVO`, `PDMC_ADMIN_PASSWORD_TEMPORAL`). `psql` no está en el PATH del servidor: está en `C:\Program Files\PostgreSQL\18\bin`.
- **Migración 003 de CYSN (agentes de tienda):** aplicada en el servidor (ya estaba; confirmado el 2026-10-21) y en la base unificada local (Docker `postgres-unificada-local`, puerto 55434, aplicada el 2026-10-21).
- **Multisitio (2026-10-21):** cada tienda (`BD_SPDV`, más de 60), cada bodega (`GDC_CASA_MATRIZ`, más de 2) y el PC de creación (`CREACION`) tienen su propio SQL Server. Lo único central es `BODEGA_DATOS` (catálogo de sitios; el identificador es `tbDimTiendas.dimID_Tienda`). Hoy PDMC solo lee una bodega. El plan está en `PLAN-agente-multisitio.md`. La fase 1 (catálogo de sitios por `dimID`) quedó desplegada el 2026-10-22: 59 sitios en PDMC y 47 sucursales de CYSN enlazadas. Feria de las Gorras y Giraldug no se enlazan porque no están en `tbDimTiendas`.
- **Despliegue al servidor:** nunca reemplazar las carpetas `PDMC-APP` ni `CYSN_QA` enteras, porque se pierden `node_modules`, `.next` y `.venv` (ocurrió 3 veces el 2026-10-21 y el 2026-10-22). Hay que copiar a `C:\temp\Servidor` y usar `robocopy … /E`.
- **Regla de datos (2026-10-26), cumplida desde el 2026-10-27:** PDMC y CYSN solo leen de PostgreSQL. Los datos de SQL Server llegan por los agentes; la única excepción es `BODEGA_DATOS.tbDimTiendas`, el catálogo de sitios. PDMC ya no lee `SERVERDOS\SERVERSQL_DOS`, que tiene una **copia de `GDC_CASA_MATRIZ` parada el 2026-08-14**; falta avisar a sistemas.
- **Fase 2b-1 (desplegada el 2026-10-27):** el inventario de PDMC sale del agente del sitio `PDMC_INVENTARIO_DIM_ID` (por defecto 2004): 18.813 productos el 2026-10-28, los mismos en el agente y en PDMC. La primera fotografía de negativos ya está publicada. Solo entran los productos **activos** y con categoría; los **inactivos no se envían por decisión revisable** (cómo añadirlos: `PLAN-agente-multisitio.md`, fase 2).
- **Fase 3b (desplegada el 2026-10-26):** el sincronizador de PDMC toma `FACTURADORES`, `TRANSFERENCIAS` y `DEVOLUCIONES` de `cysn_qa.agente_fila` (`PDMC_AGENTE_SCHEMA`), una carga por bodega. Las transferencias y devoluciones guardan `origenId` y su número es único por bodega (migración `20261026120000_origen_bodega`). El botón "Actualizar ahora" y el recuadro "Sincronizaciones automáticas" de Administración ya no dicen "SQL Server". Las copias de `PDMC-APP/backend/sqlserver/consultas/` de esos tres módulos dejan de usarse; se conservan como referencia.
- **Fase 3a (2026-10-26):** el agente tiene tareas de bodega (`TAREAS=inventario,transferencias,devoluciones,usuarios`). Las consultas van en `agente_tienda/consultas/`: es la **tercera copia** de `consultaPDMC/`, junto con `PDMC-APP/backend/sqlserver/consultas/`. Los datos se reciben en `cysn_qa.agente_fila` (migración 006, endpoint `POST /api/agente/v1/filas`), y se comparan con PDMC con `python -m app.comparar_sitio --dim-id 2004`. Desplegada el 2026-10-26 en el servidor y en la bodega MARACAIBO. El 2026-10-28 coincidían 3.473 transferencias (hasta la 82220) y 387 devoluciones.
- **Fase 4, CREACION (desplegada el 2026-10-28):**
  - **Sitio:** CREACION (dimID 2010), agente `AGT-CREACION`, en el PC de creación. Lee `SERVERSQL\SQLSERVER2005`, base `CREACION`, con el usuario `nexoqa_agente`, y `TAREAS=creacion`. El servicio de SQL Server de ese PC (`MSSQL$SERVER`) es otro y no tiene esa base.
  - **Agente:** la consulta es `agente_tienda/consultas/creacion.sql`, copia exacta de `backend/app/sync/sql/creacion_origen.sql`. Envía una fila por `CodigoBarra` a `agente_fila` (`tarea = 'creacion'`, migración 007).
  - **Worker:** `app.sync.creacion` con la fuente `AGENTE` aplica la misma normalización y los mismos controles: aborta con 0 filas o si las bajas superan el 20 %. Espera 120 s sin envíos antes de procesar y no registra ejecución si no llegó nada nuevo.
  - **Primera carga:** 210.593 filas → **169.029 vigentes** en `cysn_qa.creacion`. Se descartaron 41.564 por código de barras no válido (menos de 9 caracteres o con algo que no son dígitos), la misma regla que n8n; falta revisar una muestra.
- **Bodega MARACAIBO:** el 26/10, de 16:10 a 12:27 del día siguiente, el agente no corrió porque el PC estaba apagado. Al volver, la reconciliación de transferencias dio `timeout` una vez y se recuperó en el siguiente ciclo. Los PC de los sitios deben estar siempre encendidos y sin suspensión. En CREACION se usa `HTTP_TIMEOUT=120`.
- **Agente `SUC-015` (dimID 1017):** registrado pero nunca conectado; desactivarlo si no se va a usar.
- **Ciclos QA con el inventario del agente (2026-10-28, pendiente de desplegar):** la carga de CSV de las sucursales ya estaba retirada en el código (responde 410) y nada ponía las sucursales en `VALIDADO`, así que ningún ciclo podía llegar a `LISTO_QA`. Ahora, al **marcar el ciclo «listo para QA»**, cada sucursal `PENDIENTE` toma una fotografía de su `inventario_agente_actual` (por `sucursal_id` o por su `dim_id_tienda`) como una carga `VALIDADO` más (`app/services/inventario_agente_service.py`). El motor QA no cambia. Es todo o nada: si una sucursal no tiene inventario de agente, responde 409 con su nombre y no cambia nada. Hoy solo hay agentes de tienda de prueba, así que la prueba real llega con la fase 5.
- **Agente por sitio (2026-10-22):** la migración 005 de CYSN permite agentes de bodega (solo con `dimID`, sin sucursal de CYSN) y añade la `linea` al inventario. La bodega MARACAIBO (2004) envía su inventario como `AGT-BODEGA-MARACAIBO`. El agente solo guarda los productos **activos**, mientras que el inventario central de PDMC incluye también los inactivos; hay que decidirlo en la fase 2b.
- **Latido del agente (2026-10-21):** la API tiene un endpoint nuevo, `POST /api/agente/v1/latido`, y el agente lo llama en cada ciclo sin cambios. Así `ultimo_contacto_at` indica que el agente está vivo. El `.exe` nuevo está en `CYSN_QA/agente_tienda/dist/` y en `Servidor/NexoQAAgenteTienda-20261021.zip`. El agente `PRUEBA-CM` (sucursal 59) ya enviaba 7.442 productos con el `.exe` anterior.
- **API QA en el servidor:** su `.venv` se creó el 2026-10-21 en `ServicioQA\CYSN_QA\backend`. Antes de esa fecha la API nunca había corrido en el servidor.
- En `CYSN_QA/backend/.env` local, `DATABASE_HOST=localhost` hace que la conexión se quede colgada: Docker solo escucha en IPv4. Hay que usar `127.0.0.1`.
- Las sucursales de `cysn_qa.sucursal` no tienen `codigo`: se identifican por `id` o `nombre`.
- Puede quedar la carpeta vacía `.integracion-pdmc/`, que pertenece a otro usuario de Windows: borrarla a mano con permisos de administrador.
- **GitHub (2026-10-27):**
  - `PDMC-APP` `main` = `5e263d7`: fusión de `integracion-version-nueva` con los cambios de otra persona (restablecimiento administrativo y comparación de fotografías). La migración `20261019150000_restablecimiento_protegido` **no está aún en el servidor**.
  - `CYSN_QA` `main` = `76e7c45` (CORS para Netlify).
  - `PDB-sis/Union_de_sistemas-QA` `main` = `a15fb17`, la copia pública generada con `deployment/exportar_github.py`, más la Release `v2026.10.26` del agente.
  - **La fase 4 (2026-10-28) todavía no está subida** ni a GitHub ni a Docker Hub; el agente nuevo está en `Servidor/NexoQAAgente-20261028.zip`.
- **Fin de línea:** con `core.autocrlf=true`, cambiar de rama reescribe los `.sql` con CRLF y la prueba de copias exactas falla. Si pasa, se vuelve a copiar el archivo desde `consultaPDMC/`.

---

## 7. Seguridad

> La auditoría de seguridad y su plan de acción **no se publican** en este repositorio público. Se mantienen en la copia interna de `contexto.md`.

---

## 8. Agentes de Claude Code del proyecto

Definidos en `.claude/agents/` (raíz del espacio de trabajo). Cada uno conoce las rutas, roles, tablas, comandos y reglas de este sistema. Mantenerlos al día cuando cambie lo que describen.

| Agente | Úsalo para | Puede editar |
|---|---|---|
| `auditor-seguridad` | Revisar vulnerabilidades antes de desplegar o al tocar autenticación, SSO, permisos, tokens, SQL o Caddy. Parte de la sección 7. | No |
| `qa-pdmc` | Validar cambios en PDMC: mapa de rutas, permisos y pruebas, matriz de roles, reglas de negativos y sincronización, y los comandos de la CI. | No |
| `qa-cysn` | Validar cambios en NEXO QA: `require_role` y `require_sucursal_access`, estados del ciclo QA, diferencias, CREACION y agente. | No |
| `guardian-sql` | Revisar consultas SQL Server (solo lectura, parejas de copias) y migraciones Prisma y CYSN (`up`/`down`, esquema `cysn_qa`). | No |
| `operador-sincronizacion` | Diagnosticar fallos del sincronizador de PDMC, del worker CREACION y de los agentes, a partir de logs y tablas de estado. | No |
| `preparador-despliegue` | Preparar y revisar `Servidor/`, comprobar que no viajan secretos y redactar los pasos con `robocopy /E`. | Sí |
| `arquitecto-multisitio` | Diseñar e implementar las fases 2b a 5 de `PLAN-agente-multisitio.md`. | Sí |
| `documentador-contexto` | Mantener al día este documento y el plan, comprobando cada dato. | Solo los documentos |

Las skills de QA de PDMC (`PDMC-APP/.github/skills/qa-*`) siguen siendo la referencia de procedimiento: `qa-pdmc` y `qa-cysn` las aplican.
