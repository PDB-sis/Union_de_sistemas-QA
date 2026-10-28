# Agente de sitio NEXO QA (tiendas y bodegas)

Lee en solo lectura el inventario del SQL Server de su sitio y envía los cambios por HTTPS a `apiqa.apipalacio.com`. No abre puertos ni escribe en SQL Server.

| Sitio | Base (`SQL_DATABASE`) | Intervalo recomendado (`SYNC_INTERVAL_SECONDS`) |
|---|---|---|
| Tienda | `BD_SPDV` | 60 |
| Bodega | `GDC_CASA_MATRIZ` | 300 (inventario grande) |

- **Cada ciclo** lee el inventario completo (`INVENTARIO`, `MARCAS`, `CATEGORIAS`, `TASA_CAMBIO`, `PARAMETROS`). Calcula una huella SHA-256 por producto y **envía solo los que cambiaron**. No filtra por `UltimaActualizacion`, porque una venta no la modifica.
- **Si no hay cambios,** envía un latido, para que el servidor sepa que sigue vivo.
- **Las bajas** se envían también cuando `Status` pasa a 0.
- **Cada 24 horas** hace una reconciliación completa, para detectar productos eliminados.
- **Si falla Internet,** conserva lo pendiente (`STATE_PATH`) y lo reenvía sin perder datos.
- **La línea** (categoría padre, `LEFT(Codigo, 4)`) se envía para PDMC.

## Tareas de bodega: transferencias, devoluciones y usuarios

En las bodegas, `config.env` lleva `TAREAS=inventario,transferencias,devoluciones,usuarios`. Las tres tareas nuevas:

- **Ejecutan su consulta** desde la carpeta `consultas`, junto a `config.env`: `transferencias.sql`, `devoluciones.sql` y `usuarios.sql`. Son **copias exactas** de `consultaPDMC/` (`TRANSFERENCIAS NUEVAS.sql`, `DEVOLUCIONES.sql` y `Usuarios Activos.sql`). Si se cambia una consulta, hay que cambiarla en los tres sitios: `consultaPDMC/`, `PDMC-APP/backend/sqlserver/consultas/` y aquí. Antes de ejecutarla, el agente comprueba que solo lee.
- **Envían a `POST /api/agente/v1/filas`** las filas nuevas o cambiadas y, en el mismo ciclo, las que desaparecieron (como baja). Se identifican por: transferencias `Numero + CodigoBarra + NumeroCaja`, devoluciones `Numero` y usuarios `CodUsuario`.
- **Se guardan en `cysn_qa.agente_fila`** por bodega (`dimID_Tienda`), sin tocar PDMC. Para ver lo recibido, en el servidor: `python -m app.agentes filas --dim-id 2004`. Para compararlo con PDMC: `python -m app.comparar_sitio --dim-id 2004`.
- **Si una tarea falla,** por ejemplo por un permiso que falta, las demás siguen funcionando, y el error queda en `agente.log`.

El usuario de solo lectura de la bodega necesita, además de las 5 tablas del inventario:

```sql
USE GDC_CASA_MATRIZ;
GRANT SELECT ON dbo.MOVTRANSFERENCIAS TO nexoqa_agente;
GRANT SELECT ON dbo.TRANSFERENCIAS    TO nexoqa_agente;
GRANT SELECT ON dbo.DEVTRANSFERENCIAS TO nexoqa_agente;
GRANT SELECT ON dbo.USUARIOS          TO nexoqa_agente;
```

## Instalar en un sitio (tienda o bodega)

Se usa la carpeta compilada `dist\NexoQAAgenteTienda` (no hace falta instalar Python):

1. En el servidor, registrar el sitio y anotar `AGENT_CODE` y `AGENT_TOKEN` (ver *Registrar cada sitio*).
2. El responsable de la base de datos crea en el SQL Server del sitio un usuario **de solo lectura** con `SELECT` sobre las 5 tablas de arriba.
3. Copiar `dist\NexoQAAgenteTienda` (el servicio) y `dist\NexoQAAgenteTiendaConsola` (para probar) al PC del sitio, por ejemplo a `C:\NexoQA\agente` y `C:\NexoQA\consola`.
4. En `C:\NexoQA\agente`, copiar `config.env.example` a `config.env` y completar `AGENT_CODE`, `AGENT_TOKEN`, `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD` y `SYNC_INTERVAL_SECONDS` según la tabla.
5. Probar una vuelta con la consola, que usa el mismo `config.env`:
   ```powershell
   $env:QA_AGENT_CONFIG='C:\NexoQA\agente\config.env'; C:\NexoQA\consola\NexoQAAgenteTiendaConsola.exe --once
   ```
   La primera vez envía todo el inventario en lotes de 500. En una bodega puede tardar varios minutos.
6. Instalar el servicio, en PowerShell como administrador:
   ```powershell
   C:\NexoQA\agente\NexoQAAgenteTienda.exe --startup auto install; Start-Service NexoQAAgenteTienda
   ```
   El registro queda en `C:\NexoQA\agente\agente.log`.

## Preparar el servidor (una vez)

Desplegar la API y aplicar la migración `003_agentes_tienda_up.sql`. En la base unificada (`sistemas_unificados`, esquema `cysn_qa`):

```powershell
.\deployment\Aplicar-Migracion-CYSN.ps1 -Migracion 003_agentes_tienda_up.sql -PgBin 'C:\Program Files\PostgreSQL\18\bin'
```

Las bases creadas con `Crear-Base-Unificada.ps1` después del 2026-10-15 ya la incluyen.

## Registrar cada sitio (en el servidor, desde `CYSN_QA\backend`)

Bodegas, y tiendas ya enlazadas con su `dimID_Tienda`:

```powershell
.venv\Scripts\python.exe -m app.agentes crear --dim-id 2004              # BODEGA MARACAIBO
```

Tiendas por su sucursal de CYSN:

```powershell
.venv\Scripts\python.exe -m app.agentes sucursales                  # ver el id de la sucursal
.venv\Scripts\python.exe -m app.agentes crear --sucursal-id 4       # o --sucursal "galerias"
```

`crear` muestra `AGENT_CODE` y `AGENT_TOKEN` **una sola vez**; copiarlos al `config.env` de la tienda. En la base solo queda el hash SHA-256 del token.

Otros comandos:

| Comando | Para qué |
|---|---|
| `listar` | Agentes, último contacto y productos recibidos |
| `listar --sin-contacto-minutos 5` | Igual, y sale con código 2 si algún agente activo lleva más de 5 min sin contacto (útil para una tarea programada de aviso) |

**Último contacto = el agente está vivo.** En cada ciclo sin cambios el agente envía un latido (`POST /api/agente/v1/latido`), así que con `SYNC_INTERVAL_SECONDS=60` el último contacto nunca debería pasar de unos 2 minutos. Si pasa de 5, el PC de la tienda está apagado, sin Internet o el servicio se detuvo. Los agentes compilados antes del 2026-10-21 no envían latido: solo contactan cuando hay cambios.
| `rotar-token --codigo AGT-X` | Token nuevo; el anterior deja de funcionar al instante |
| `desactivar --codigo AGT-X` / `activar --codigo AGT-X` | Rechazar o volver a aceptar los envíos sin borrar el agente |