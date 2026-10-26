# Sincronización CREACION (reemplazo de n8n)

```
SQL Server CREACION ──solo lectura──► worker app.sync.creacion
                                          │
                                          └── INSERT / UPDATE / baja lógica
                                              exclusivamente en public.creacion
```

| Pieza | Ubicación |
|---|---|
| Consulta origen versionada | `app/sync/sql/creacion_origen.sql` |
| Reglas de limpieza (port de n8n) | `app/sync/normalizacion.py` |
| Lectura SQL Server + verificación de permisos | `app/sync/origen_sqlserver.py` |
| Worker / CLI | `app/sync/creacion.py` |
| Migraciones | `migrations/001_*` (compatible con n8n), `migrations/002_*` (corte) |
| Respaldo / restauración | `scripts/01_respaldo_creacion.sql`, `scripts/99_restaurar_creacion.sql` |
| Pruebas | `tests/sync/` |
| Estado para el panel | `GET /api/sincronizacion/creacion/estado` |

Diferencias deliberadas con n8n:

- n8n hacía `TRUNCATE ... RESTART IDENTITY` y reinsertaba todo; el worker solo aplica diferencias y **nunca borra**.
- Números con `Decimal` (n8n usaba float de JavaScript).
- Duplicados de `CodigoBarra` en el origen: se conserva la última fila recibida (la que la comparación QA ya tomaba por `registro_id` más reciente) y se informa el conteo.
- Si el origen trae 0 filas o las bajas superan `CYSN_SYNC_MAX_BAJAS_PORCENTAJE`, la ejecución se aborta sin tocar datos.

---

## 1. Congelar y respaldar

1. Exportar el workflow de n8n (ya guardado en `aportes/`). No apagar n8n.
2. Respaldo lógico completo:
   ```
   pg_dump -h <host> -U <usuario> -d cysn_qa -t public.creacion -Fc -f creacion_AAAAMMDD.dump
   ```
3. Copia en la misma base + línea base de conteos y muestra:
   ```
   psql -h <host> -U <usuario> -d cysn_qa -f scripts/01_respaldo_creacion.sql
   ```

**Salida:** existe `respaldo.creacion_AAAAMMDD_HHMI`, el `.dump`, y una fila en `respaldo.creacion_linea_base`.

## 2. Accesos seguros (DBA)

Script de referencia para el DBA en SQL Server:

```sql
CREATE LOGIN cysn_sync WITH PASSWORD = '<secreto>', CHECK_POLICY = ON;
USE CREACION;
CREATE USER cysn_sync FOR LOGIN cysn_sync;
GRANT SELECT ON dbo.INVENTARIO  TO cysn_sync;
GRANT SELECT ON dbo.MARCAS      TO cysn_sync;
GRANT SELECT ON dbo.CATEGORIAS  TO cysn_sync;
GRANT SELECT ON dbo.TASA_CAMBIO TO cysn_sync;
GRANT SELECT ON dbo.PARAMETROS  TO cysn_sync;
-- Sin roles db_datawriter / db_owner, sin EXECUTE, sin DDL.
```

Red: permitir el puerto de SQL Server solo desde el servidor de CYSN_QA. TLS habilitado.

En el servidor de CYSN_QA: instalar **ODBC Driver 18 for SQL Server** y `pip install pyodbc`. Variables de entorno (o en `backend/.env`):

```
CYSN_SQLSERVER_HOST=
CYSN_SQLSERVER_INSTANCE=          # o CYSN_SQLSERVER_PORT=1433
CYSN_SQLSERVER_DATABASE=CREACION
CYSN_SQLSERVER_USER=cysn_sync
CYSN_SQLSERVER_PASSWORD=
CYSN_SQLSERVER_ENABLED=false      # interruptor general
# Opcionales (valor por defecto):
# CYSN_SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server
# CYSN_SQLSERVER_ENCRYPT=true
# CYSN_SQLSERVER_TRUST_SERVER_CERTIFICATE=false
# CYSN_SQLSERVER_REQUIRE_READONLY=true   # aborta si el usuario puede escribir
# CYSN_SYNC_INTERVALO_SEGUNDOS=180
# CYSN_SYNC_REINTENTOS=3
# CYSN_SYNC_ESPERA_REINTENTO_SEGUNDOS=10
# CYSN_SYNC_MAX_BAJAS_PORCENTAJE=20
# CYSN_SYNC_MIN_FILAS_VALIDAS=1
```

Verificación (desde `backend/`):

```
python -m app.sync.creacion --verificar-origen
```

**Salida:** `select_1: true` y `permisos_escritura: []`. Si el usuario tiene cualquier permiso de escritura, el worker se niega a sincronizar.

## 3. PostgreSQL

Orden obligatorio:

1. `psql ... -f migrations/001_creacion_sync_up.sql` (n8n puede seguir activo).
2. Desplegar el backend con el filtro `vigente = TRUE` en la comparación QA (`app/main.py`, `app/services/qa_ciclo_engine.py`).

La 001 solo agrega columnas con `DEFAULT` y tablas nuevas; no toca datos. Las filas que n8n siga insertando quedan `vigente = true`.

La resolución de duplicados y la restricción única están en la **002**, que se aplica en el corte (paso 8), porque n8n vuelve a cargar duplicados en cada TRUNCATE.

## 4–6. Worker

```
python -m app.sync.creacion --dry-run     # lee, compara y registra; no escribe en creacion
python -m app.sync.creacion               # una sincronización real
python -m app.sync.creacion --loop        # continuo cada CYSN_SYNC_INTERVALO_SEGUNDOS
python -m app.sync.creacion --forzar      # una vez, omitiendo el límite de bajas masivas
```

Códigos de salida: `0` ok, `1` fallo (reintentable), `2` configuración/seguridad, `3` otra ejecución en curso.

Flujo de cada ejecución:

1. `pg_try_advisory_lock` (si otro worker corre, termina como OMITIDA).
2. Lectura de SQL Server con reintentos y verificación de permisos.
3. Validación y normalización de todas las filas.
4. **Una transacción** PostgreSQL: staging temporal → UPDATE → INSERT → baja lógica → registro de totales → COMMIT.
5. Cualquier error: ROLLBACK; queda la fotografía anterior y se registra la falla en `sincronizacion_ejecucion`.

Ejecución como servicio de Windows (ejemplo con NSSM):

```
nssm install CYSN_Sync_Creacion "<ruta>\python.exe" "-m app.sync.creacion --loop"
nssm set CYSN_Sync_Creacion AppDirectory "<ruta>\CYSN_QA\backend"
nssm set CYSN_Sync_Creacion AppStdout "<ruta>\logs\sync_creacion.log"
nssm set CYSN_Sync_Creacion AppStderr "<ruta>\logs\sync_creacion.log"
nssm set CYSN_Sync_Creacion AppExit Default Restart
```

Alternativa: Programador de tareas ejecutando `python -m app.sync.creacion` cada N minutos (el lock evita solapes).

## 7. Pruebas

```
python -m pytest tests/sync -q
```

- `test_normalizacion.py`: limpieza de códigos, nulos, decimales, hash (no requiere base de datos).
- `test_creacion_integracion.py`: código nuevo, cambio de precio, cambio de tasa, código inválido, producto que desaparece/reaparece, caída de SQL Server, error en la transacción, dos workers, dry-run, bloqueo de TRUNCATE, compatibilidad con datos de n8n y reversión de 002. Requiere una base **descartable** con "test" en el nombre:
  ```
  set CYSN_TEST_DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/cysn_qa_test
  ```

## 8. Puesta en producción

1. Con n8n activo, programar `--dry-run` varios ciclos. Tras una corrida de n8n, el dry-run debería informar `insertados=0, actualizados=0, inactivados=0` si ambos ven la misma fotografía. Revisar `detalle` en `sincronizacion_ejecucion` (muestras de códigos nuevos/cambiados/bajas).
2. En horario controlado:
   1. **Detener n8n** (desactivar el workflow).
   2. Respaldo nuevo (`scripts/01_respaldo_creacion.sql`).
   3. `psql ... -f migrations/002_creacion_corte_up.sql` → duplicados quedan `vigente=false`, índice único, TRUNCATE bloqueado.
   4. `python -m app.sync.creacion` (primera real). Es normal ver `hash_completados` alto: completa el hash de las filas cargadas por n8n sin contarlas como cambios.
   5. `CYSN_SQLSERVER_ENABLED=true` e iniciar el servicio `--loop`.
3. Monitoreo 48 h:
   ```sql
   SELECT id, modo, estado, iniciado_en, duracion_ms, total_validos,
          insertados, actualizados, inactivados, error
   FROM public.sincronizacion_ejecucion ORDER BY id DESC LIMIT 20;
   ```
4. Retirar n8n tras validar estabilidad.

### Reversión

| Situación | Acción |
|---|---|
| Volver a n8n | Detener el servicio → `002_creacion_corte_down.sql` → reactivar n8n |
| Datos dañados | Detener servicio y n8n → `psql -v respaldo=creacion_AAAAMMDD_HHMI -f scripts/99_restaurar_creacion.sql` |
| Quitar todo | 002 down → backend anterior → `001_creacion_sync_down.sql` |
