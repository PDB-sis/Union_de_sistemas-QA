# PDMC: backend (API Hono) + frontend (Vite) compilado. La misma imagen sirve la web ("web":
# aplica las migraciones y arranca la API sirviendo también la interfaz) y el sincronizador ("sync").
# Contexto de construcción: la raíz del repositorio.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY PDMC-APP/package.json PDMC-APP/package-lock.json ./
COPY PDMC-APP/contratos/package.json contratos/
COPY PDMC-APP/backend/package.json backend/
COPY PDMC-APP/frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY PDMC-APP/ ./
# build: verificación de arquitectura y textos, build del frontend y verificación de tipos del backend.
RUN npm run build && npm run db:generate -w backend

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="PDMC" \
      org.opencontainers.image.description="Panel de Mejora Continua (API, interfaz y sincronizador)" \
      org.opencontainers.image.source="https://github.com/PDB-sis/Union_de_sistemas-QA"
ENV NODE_ENV=production \
    PORT=3000 \
    PDMC_HOST=0.0.0.0
WORKDIR /app
# Se conservan prisma (migraciones) y tsx (servidor, sincronizador y scripts).
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 docker/pdmc/entrypoint.sh /usr/local/bin/pdmc-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/pdmc-entrypoint
USER node
WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["pdmc-entrypoint"]
CMD ["web"]
