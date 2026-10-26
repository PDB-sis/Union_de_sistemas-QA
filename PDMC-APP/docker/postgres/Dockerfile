FROM postgres:17

LABEL org.opencontainers.image.title="PDMC PostgreSQL"
LABEL org.opencontainers.image.description="Esquema limpio de PostgreSQL para PDMC"
LABEL org.opencontainers.image.source="https://github.com/controldeinconsistencias-code/PDMC-APP"

COPY init.sql /docker-entrypoint-initdb.d/001-pdmc.sql
