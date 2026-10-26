# Base unificada sistemas_unificados (PostgreSQL 18), vacía y con estructura:
# esquemas pdmc y cysn_qa, estructura y migraciones de NEXO QA y sus catálogos.
# Las tablas de PDMC las crea el contenedor de PDMC (prisma migrate deploy).
# Contexto de construcción: la raíz del repositorio.

# Las migraciones de CYSN se escribieron para "public": se adaptan a cysn_qa igual
# que deployment/Aplicar-Migracion-CYSN.ps1, a partir de los archivos del repositorio.
FROM alpine:3.20 AS migraciones
COPY CYSN_QA/backend/migrations/ /migraciones/
RUN set -eu; out=/20-cysn_qa_migraciones.sql; \
    echo "-- Migraciones de CYSN_QA/backend/migrations adaptadas a cysn_qa." > "$out"; \
    for f in $(ls /migraciones/*_up.sql | sort); do \
      echo "-- $(basename "$f")" >> "$out"; \
      echo "SET search_path TO cysn_qa, public;" >> "$out"; \
      sed -e '/^\\\(un\)\{0,1\}restrict/d' -e 's/public\./cysn_qa./g' "$f" >> "$out"; \
      echo >> "$out"; \
    done

FROM postgres:18
LABEL org.opencontainers.image.title="sistemas_unificados" \
      org.opencontainers.image.description="PostgreSQL 18 con los esquemas pdmc y cysn_qa (sin datos)" \
      org.opencontainers.image.source="https://github.com/PDB-sis/Union_de_sistemas-QA"
ENV POSTGRES_DB=sistemas_unificados
COPY docker/postgres/initdb/00-esquemas.sql /docker-entrypoint-initdb.d/00-esquemas.sql
COPY docker/postgres/initdb/10-cysn_qa_estructura.sql /docker-entrypoint-initdb.d/10-cysn_qa_estructura.sql
COPY --from=migraciones /20-cysn_qa_migraciones.sql /docker-entrypoint-initdb.d/20-cysn_qa_migraciones.sql
COPY docker/postgres/initdb/30-cysn_qa_catalogos.sql /docker-entrypoint-initdb.d/30-cysn_qa_catalogos.sql
