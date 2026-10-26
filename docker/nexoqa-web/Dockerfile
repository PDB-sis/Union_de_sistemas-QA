# Interfaz de NEXO QA (React + Vite) servida con nginx. Se compila con rutas
# relativas (VITE_API_URL vacío): nginx reenvía /api/ a la API, así la imagen
# no depende de ninguna dirección fija.
# Contexto de construcción: la raíz del repositorio.
FROM node:22-bookworm-slim AS build
WORKDIR /web
COPY CYSN_QA/frontend/package.json CYSN_QA/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY CYSN_QA/frontend/ ./
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="NEXO QA web" \
      org.opencontainers.image.description="Interfaz de NEXO QA; reenvía /api/ a la API" \
      org.opencontainers.image.source="https://github.com/PDB-sis/Union_de_sistemas-QA"
COPY docker/nexoqa-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 8080
