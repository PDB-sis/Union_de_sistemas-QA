# PDMC — Panel de Mejora Continua

Aplicación empresarial construida con Next.js, TypeScript, Prisma y PostgreSQL para gestionar transferencias, reportes de tiendas, inconsistencias, negativos, inventario, facturación, etiquetado, pedidos y mejora continua.

El código está separado en **frontend/**, **backend/** y **shared/**. Consulta la [arquitectura y los puntos de integración](docs/ARQUITECTURA.md). Se conserva un único despliegue y las mismas rutas API.

## Requisitos

- Node.js 22 y npm
- PostgreSQL 17 o Docker

## Instalación

```bash
npm ci
```

Copie `.env.example` como `.env.local` y complete `DATABASE_URL`. No use variables `NEXT_PUBLIC_` para conexiones o secretos.

### PostgreSQL con Docker

El proyecto utiliza la imagen limpia `sistemaspdb/pdmc-postgres:2026.10.06`, publicada en Docker Hub. Incluye PostgreSQL 17, el esquema completo y el historial técnico de migraciones; no contiene usuarios, contraseñas ni datos operativos.

Cree el secreto local requerido por `docker/compose.yaml`:

```bash
mkdir -p .secrets
printf "una-clave-segura" > .secrets/postgres-password
```

Luego ejecute:

```bash
docker compose -f docker/compose.yaml up -d
npm run db:migrate
npm run db:seed
```

Las migraciones son versionadas y no requieren `prisma migrate reset`.

También puede descargar la imagen por separado:

```bash
docker pull sistemaspdb/pdmc-postgres:2026.10.06
```

## Ejecución

```bash
npm run dev
```

Para producción:

```bash
npm run build
npm start
```

El servidor escucha en HTTPS cuando se configuran `PDMC_TLS_PFX_FILE` y `PDMC_TLS_PASSWORD_FILE`. Consulte `.env.example`.

## Datos iniciales

Los catálogos empresariales no forman parte del repositorio. Cree primero cada región y después sus tiendas desde **Administración → Entidades operativas**. Cada tienda requiere el código único utilizado por la consulta corporativa, un nombre administrado en PDMC y una región.

## Instalación limpia con un solo administrador

Este procedimiento se utiliza en un computador nuevo para iniciar PDMC sin tiendas, inventario, transferencias, negativos, inconsistencias ni reportes anteriores.

Primero clone el proyecto e instale sus dependencias:

```powershell
git clone https://github.com/controldeinconsistencias-code/PDMC-APP.git
Set-Location PDMC-APP
npm ci
```

Cree el secreto local de PostgreSQL e inicie el contenedor:

```powershell
New-Item -ItemType Directory -Force .secrets
Set-Content -LiteralPath .secrets\postgres-password -Value "COLOQUE_UNA_CLAVE_SEGURA" -NoNewline
docker compose -f docker/compose.yaml up -d
```

Copie `.env.example` como `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

Configure en `.env.local` la misma contraseña utilizada para Docker:

```dotenv
DATABASE_URL=postgresql://pdmc_owner:CLAVE_CODIFICADA@localhost:55432/pdmc?schema=public
PDMC_AUTH_ORIGIN=http://localhost:3000
```

Si la contraseña contiene caracteres especiales, codifíquelos para utilizarlos dentro de una URL. No use variables `NEXT_PUBLIC_` para conexiones o secretos.

Aplique todas las migraciones y compruebe la conexión:

```powershell
npm run db:migrate
npm run db:check
```

La base ya tendrá su estructura, pero continuará sin usuarios. Para crear solamente el administrador nacional, defina temporalmente estas variables en PowerShell:

```powershell
$env:PDMC_SEED_ADMINISTRADOR_EMAIL = "correo-administrador@empresa.com"
$env:PDMC_SEED_ADMINISTRADOR_NOMBRE = "Administrador PDMC"
$env:PDMC_SEED_ADMINISTRADOR_PASSWORD = "CONTRASEÑA_TEMPORAL_SEGURA"
npm run crear-usuarios-iniciales
```

La contraseña temporal debe tener entre 12 y 128 caracteres, vence en 48 horas y debe cambiarse durante el primer acceso. Si la operación termina correctamente, el comando indicará que creó una cuenta.

Retire inmediatamente las variables temporales de la consola:

```powershell
Remove-Item Env:PDMC_SEED_ADMINISTRADOR_EMAIL
Remove-Item Env:PDMC_SEED_ADMINISTRADOR_NOMBRE
Remove-Item Env:PDMC_SEED_ADMINISTRADOR_PASSWORD
```

Compile e inicie la aplicación:

```powershell
npm run build
npm start
```

Ingrese con el correo y la contraseña temporal. La cuenta tendrá rol `ADMINISTRADOR` con alcance nacional. Después deberá crear las regiones, registrar manualmente cada tienda con su código corporativo y crear las demás cuentas desde la interfaz.

No agregue las variables `PDMC_SEED_*`, contraseñas, archivos `.env.local`, respaldos ni datos empresariales al repositorio.

## Validación

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

GitHub Actions ejecuta estas comprobaciones con PostgreSQL 17 en cada push y pull request.

## Seguridad

Nunca publique `.env.local`, `.secrets/`, certificados, respaldos, datos empresariales ni registros de ejecución. El repositorio incluye únicamente `.env.example` con valores vacíos.

## Migración a otro servidor

El código y las migraciones Prisma son independientes del servidor. La migración de los datos PostgreSQL se realiza por separado mediante una exportación y restauración controladas del contenedor origen.
