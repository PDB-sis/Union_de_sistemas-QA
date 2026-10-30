#!/bin/sh
# web:  aplica las migraciones de PDMC (esquema de DATABASE_URL) y arranca la API de PDMC
#       sirviendo también el frontend compilado (frontend/dist) en el mismo puerto.
# sync: sincronizador; lee lo que envían los agentes (y BODEGA_DATOS si PDMC_SQLSERVER_ENABLED=true).
# Cualquier otra orden se ejecuta tal cual (p. ej. npm run crear-usuarios-iniciales).
# Directorio de trabajo: /app/backend.
set -eu
case "${1:-web}" in
  web)
    npx prisma migrate deploy
    exec node --import tsx src/server.ts --frontend
    ;;
  sync)
    exec node --import tsx scripts/sincronizar-sqlserver.ts
    ;;
  *)
    exec "$@"
    ;;
esac
