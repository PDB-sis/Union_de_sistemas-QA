# Union_de_sistemas-QA

Integración de dos sistemas internos sobre una sola base PostgreSQL (`sistemas_unificados`):

| Carpeta | Sistema |
|---|---|
| `PDMC-APP/` | **PDMC – Panel de Mejora Continua** (Next.js 16, Prisma, PostgreSQL): transferencias, devoluciones, inventario, negativos, facturación y reportes de tiendas. |
| `CYSN_QA/` | **NEXO QA** (FastAPI + React/Vite) y el **agente de sitio** para Windows que envía a PostgreSQL los datos del SQL Server de cada tienda o bodega. |
| `consultaPDMC/` | Consultas SQL Server originales (solo lectura). Las copias de `PDMC-APP/sqlserver/consultas/` y `CYSN_QA/agente_tienda/consultas/` deben ser idénticas. |
| `deployment/` | Scripts de la base unificada, migraciones de CYSN y Caddy. |
| `docker/`, `compose.yaml` | Imágenes de Docker (`sistemaspdb/*` en Docker Hub) y su orquestación. |

**Regla de datos:** PDMC y NEXO QA solo leen de PostgreSQL. Los datos de los SQL Server de tiendas y bodegas llegan por los agentes. La única excepción es el catálogo de sitios (`BODEGA_DATOS.tbDimTiendas`).

## Levantarlo con Docker

```powershell
copy .env.example .env    # completar los tres secretos
docker compose pull
docker compose up -d
```

PDMC queda en http://localhost:3000 y NEXO QA en http://localhost:8080. Los pasos completos (usuarios iniciales, agentes, operación) están en [`DOCKER.md`](DOCKER.md).

## Documentación

- [`contexto.md`](contexto.md): arquitectura, comandos, convenciones y reglas de negocio.
- [`PLAN-agente-multisitio.md`](PLAN-agente-multisitio.md): plan por fases del agente multisitio y su estado.

## Qué no está en este repositorio

Secretos (`.env`, `config.env`, `.secrets/`), respaldos de base de datos, logs, el paquete de despliegue `Servidor/`, binarios compilados del agente y la auditoría de seguridad interna. Cada instalación configura sus propios `.env` a partir de los `.env.example`.
