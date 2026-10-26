# Levantar el sistema con Docker

Con Docker se levantan, en un solo paso, la base unificada, PDMC, la API de NEXO QA y la interfaz de NEXO QA. Las imágenes están publicadas en Docker Hub como `sistemaspdb/*`.

| Servicio | Imagen | Dirección por defecto |
|---|---|---|
| PostgreSQL 18, base `sistemas_unificados` (esquemas `pdmc` y `cysn_qa`) | `sistemaspdb/postgres-unificada` | `127.0.0.1:55450` |
| PDMC (web) | `sistemaspdb/pdmc` | http://localhost:3000 |
| PDMC (sincronizador) | `sistemaspdb/pdmc` | — |
| API de NEXO QA y receptor de los agentes | `sistemaspdb/nexoqa-api` | http://localhost:5082 |
| Interfaz de NEXO QA | `sistemaspdb/nexoqa-web` | http://localhost:8080 |

La base arranca **vacía, solo con la estructura** (y los catálogos que NEXO QA necesita). Los datos llegan como en producción:

- **Inventario, transferencias, devoluciones y usuarios:** los envía el **agente** instalado en cada tienda o bodega (`CYSN_QA/agente_tienda`) a la API, en `http://<este equipo>:5082`.
- **Catálogo de sitios** (`BODEGA_DATOS.tbDimTiendas`): lo lee el sincronizador de PDMC en SQL Server, solo si `PDMC_SQLSERVER_ENABLED=true`. Es lo único que se consulta en SQL Server.

## 1. Requisitos

Docker Desktop (Windows o macOS) o Docker Engine con Compose v2.

## 2. Configurar

```powershell
git clone https://github.com/PDB-sis/Union_de_sistemas-QA.git
cd Union_de_sistemas-QA
copy .env.example .env
```

Abre `.env` y completa los tres secretos: `POSTGRES_PASSWORD`, `NEXOQA_JWT_SECRET` y `SSO_SECRET`. Usa valores largos, distintos y que no se repitan entre instalaciones. Para generar uno:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(36))"
```

## 3. Arrancar

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

La primera vez, PostgreSQL crea la base y PDMC aplica sus migraciones. Espera a que `pdmc` aparezca como `healthy`.

## 4. Crear los primeros usuarios (una sola vez)

**PDMC: administrador.** La contraseña es temporal: hay que cambiarla en el primer acceso.

```powershell
docker compose exec -e PDMC_SEED_ADMINISTRADOR_EMAIL=admin@empresa.com -e PDMC_SEED_ADMINISTRADOR_NOMBRE="Administración" -e PDMC_SEED_ADMINISTRADOR_PASSWORD="ContraseñaTemporal-2026" pdmc npm run crear-usuarios-iniciales
```

**PDMC: cuenta de sistema del inventario.** No tiene contraseña, así que nadie puede iniciar sesión con ella.

```powershell
docker compose exec pdmc npm run sync:crear-usuario
```

**NEXO QA: administrador.** La contraseña se pide por teclado y debe tener 12 caracteres o más.

```powershell
docker compose exec -it nexoqa-api python -m app.crear_administrador --usuario admin --nombre "Administración QA"
```

## 5. Conectar los agentes

En el servidor, registra cada sitio y anota su token:

```powershell
docker compose exec nexoqa-api python -m app.agentes crear --dim-id 2004
```

Después instala el agente en el sitio (ver `CYSN_QA/agente_tienda/README.md`) con `API_URL=http://<este equipo>:5082`. Para comprobar que llegan datos:

```powershell
docker compose exec nexoqa-api python -m app.agentes listar
docker compose exec nexoqa-api python -m app.agentes filas
```

Las bodegas y tiendas deben existir en el catálogo de sitios de PDMC. Se cargan desde `BODEGA_DATOS` con `PDMC_SQLSERVER_ENABLED=true`, y después se enlazan en NEXO QA con `python -m app.agentes proponer-enlaces` y `aplicar-enlaces`.

## Operación

| Tarea | Comando |
|---|---|
| Ver registros | `docker compose logs -f pdmc pdmc-sync nexoqa-api` |
| Actualizar a una versión nueva | `docker compose pull` y después `docker compose up -d` |
| Reconstruir desde el código | `docker compose build` y después `docker compose up -d` |
| Respaldar la base | `docker compose exec postgres pg_dump -U postgres -Fc sistemas_unificados > respaldo.dump` |
| Detener | `docker compose down` (los datos quedan en el volumen `postgres_data`) |

`docker compose down -v` **borra el volumen con todos los datos.**

## Publicar las imágenes (mantenedores)

```powershell
docker compose build
docker login
docker compose push
```

Para publicar una versión con número, por ejemplo `2026.10.26`, pon `VERSION=2026.10.26` en `.env` antes de `build` y `push`, y vuelve a publicar `latest`. Las imágenes son públicas: **no deben llevar nunca secretos ni datos**. `.dockerignore` excluye los `.env`, `config.env`, `.secrets/`, los respaldos y los logs.

## Diferencias con el servidor actual

- **Usuario de la base:** todo usa el usuario `postgres`, igual que hoy en el servidor. Para producción conviene crear usuarios con permisos mínimos.
- **HTTPS:** no hay. Para publicarlo hacia fuera se pone delante un proxy con HTTPS (en el servidor se usa Caddy, en `deployment/caddy/`). En ese caso `PDMC_ORIGEN` y `NEXOQA_ORIGEN` deben ser las direcciones `https://` públicas.
- **El worker de CREACION de CYSN no se incluye:** CREACION llegará por el agente de la bodega CREACION (fase 4 de `PLAN-agente-multisitio.md`).
