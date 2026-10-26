#!/bin/sh
# web:  aplica las migraciones de PDMC (esquema de DATABASE_URL) y arranca Next.js.
# sync: sincronizador; lee lo que envían los agentes (y BODEGA_DATOS si PDMC_SQLSERVER_ENABLED=true).
# Cualquier otra orden se ejecuta tal cual (p. ej. npm run crear-usuarios-iniciales).
set -eu
case "${1:-web}" in
  web)
    npx prisma migrate deploy
    exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  sync)
    exec node --conditions=react-server --import tsx scripts/sincronizar-sqlserver.ts
    ;;
  *)
    exec "$@"
    ;;
esac
