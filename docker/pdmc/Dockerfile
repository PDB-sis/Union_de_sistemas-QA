# PDMC (Next.js 16). La misma imagen sirve la web ("web", aplica las migraciones al
# arrancar) y el sincronizador ("sync"), que lee lo que envían los agentes.
# Contexto de construcción: la raíz del repositorio.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY PDMC-APP/package.json PDMC-APP/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY PDMC-APP/ ./
# build: verificación de arquitectura y textos, prisma generate y next build.
# La caché de compilación de Next.js no hace falta para ejecutar.
RUN npm run build && rm -rf .next/cache

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="PDMC" \
      org.opencontainers.image.description="Panel de Mejora Continua (web y sincronizador)" \
      org.opencontainers.image.source="https://github.com/PDB-sis/Union_de_sistemas-QA"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
# Se conservan las dependencias de desarrollo: prisma (migraciones) y tsx (sincronizador y scripts).
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 docker/pdmc/entrypoint.sh /usr/local/bin/pdmc-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/pdmc-entrypoint
USER node
EXPOSE 3000
ENTRYPOINT ["pdmc-entrypoint"]
CMD ["web"]
