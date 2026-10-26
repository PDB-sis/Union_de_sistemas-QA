# API de NEXO QA (FastAPI). Recibe también los envíos de los agentes (/api/agente/v1).
# Contexto de construcción: la raíz del repositorio.
FROM python:3.12-slim
LABEL org.opencontainers.image.title="NEXO QA API" \
      org.opencontainers.image.description="API FastAPI de NEXO QA y receptor de los agentes de sitio" \
      org.opencontainers.image.source="https://github.com/PDB-sis/Union_de_sistemas-QA"
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# unixodbc: pyodbc lo necesita para importarse (la lectura de SQL Server queda en los agentes).
RUN apt-get update \
 && apt-get install -y --no-install-recommends unixodbc \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY deployment/requirements-qa-production.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY CYSN_QA/backend/app ./app
RUN useradd --system --no-create-home nexoqa
USER nexoqa
EXPOSE 5082
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5082", "--proxy-headers", "--forwarded-allow-ips", "*"]
