# Plan: agente multisitio (tiendas, bodegas y PC de creación)

> Estado (2026-10-22): **fase 1 desplegada en el servidor.** La fase 2a (el agente y la API por sitio, con bodegas) está **desplegada y en marcha**. El piloto es la bodega MARACAIBO (2004), con el agente `AGT-BODEGA-MARACAIBO` como servicio cada 300 s: lee 201.271 filas y envía 18.781 productos activos. Se instaló en el PC del antiguo `PRUEBA-CM` (`SERVERSQL\SQL2005`, base `GDC_CASA_MATRIZ`, usuario de solo lectura `nexoqa_agente`), y `PRUEBA-CM` quedó desactivado. La fase 2b (PDMC lee el inventario por sitio y los negativos por sitio) **queda en pausa por decisión del 2026-10-22**. Antes de retomarla hay que decidir si se envían los productos inactivos y si se desactiva el inventario central. La fase 3a (el agente de bodega envía transferencias, devoluciones y usuarios a `cysn_qa.agente_fila`, sin tocar PDMC) está desplegada el 2026-10-26. La fase 3b (PDMC importa esos datos por bodega en lugar de leer `SERVERDOS`) está **desplegada el 2026-10-26**. PDMC tiene 3.429 transferencias (hasta la 82.176), 145.522 líneas, 385 devoluciones y 21 facturadores, idénticos al agente según `comparar_sitio`. Las fases 4 y 5 están sin empezar.
>
> - **PDMC:** el catálogo tiene 59 sitios, 6 bodegas y 53 tiendas, todos con `dimID` y en la región `SIN-REGION`, pendientes de asignar.
> - **CYSN:** 47 de 59 sucursales enlazadas. Las 12 sin enlazar se excluyen a propósito: 7 de Feria de las Gorras y 4 de Giraldug, que no están en `tbDimTiendas`, y la sucursal 59 de prueba (`PRUEBA-CM`).
> Contexto general en `contexto.md`.

## 1. Problema

PDMC lee transferencias, devoluciones, usuarios e inventario de **un solo** SQL Server: el de una bodega real, en su base `GDC_CASA_MATRIZ`. Pero cada sitio tiene su propio SQL Server:

| Sitio | Cantidad | Base | Datos que tiene |
|---|---|---|---|
| Tienda | más de 60 | `BD_SPDV` | inventario, usuarios |
| Bodega | más de 2 | `GDC_CASA_MATRIZ` | transferencias, devoluciones, inventario, usuarios |
| PC de creación | 1 | `CREACION` | creación de productos |
| Central | 1 | `BODEGA_DATOS` | catálogo de sitios (`tbDimTiendas`) |

Hoy PDMC solo ve una bodega. CYSN no puede leer `CREACION`: el worker intenta leerla desde el servidor, y la base está en el PC de creación. Las consultas son iguales en todos los sitios del mismo tipo.

## 2. Decisiones

1. **Identidad única de sitio: `BODEGA_DATOS.tbDimTiendas.dimID_Tienda`.** La usan las tiendas de PDMC, las sucursales de CYSN y los agentes. Las bodegas también están en `tbDimTiendas`, con `Status = 1`, `Tipo = 0` y `ModoOp = 0`.
2. **Un solo agente** (el `.exe` actual) por sitio, con **tareas** según su tipo. Reutiliza el token, el latido, el envío solo de cambios, la recuperación sin pérdida y el alta con `app.agentes`.
3. **Una sola API receptora**, la de CYSN, ya desplegada. Guarda lo recibido **en bruto y con su sitio de origen**. Cada sistema lo procesa con su propia lógica: PDMC con sus importadores en TypeScript y CYSN con la suya. No se duplica la lógica de negocio.
4. **Inventario por sitio, compartido.** Se guarda una vez y lo leen PDMC y CYSN. Las dos aplicaciones están en la misma base (`sistemas_unificados`), así que PDMC lo lee del esquema `cysn_qa` sin copiarlo.
5. **Todo dato operativo lleva su sitio:**
   - Los números de transferencia y devolución **se repiten entre bodegas**, así que la clave es `(sitio, número)`.
   - El código y el nombre de un facturador **pueden repetirse entre sitios**, así que la clave es `(sitio, código)`.
   - Cada carga solo da de baja lo **de su propio sitio**.
6. **Negativos por bodega y por tienda**, cada sitio con su propia foto semanal.
7. **Lo central se queda en el servidor:** el catálogo de sitios (`BODEGA_DATOS`) lo sigue leyendo el sincronizador de PDMC.
8. **Regla (2026-10-26): PDMC y CYSN solo leen de PostgreSQL.** Los datos de los SQL Server llegan a PostgreSQL únicamente por los agentes de cada sitio. La **única excepción** es el catálogo de sitios (`BODEGA_DATOS.tbDimTiendas`), que sigue leyendo el sincronizador de PDMC. Al terminar las fases 2b, 3b y 4, el sincronizador de PDMC solo ejecutará `SUCURSALES`, y el worker de CREACION de CYSN se retira.
   - **Motivo:** el 2026-10-26 se comprobó que `SERVERDOS\SERVERSQL_DOS`, de donde PDMC sacaba transferencias, devoluciones, facturadores e inventario, tiene una **copia de `GDC_CASA_MATRIZ` parada el 2026-08-14** (última transferencia 80.016, frente a la 82.176 de la bodega Maracaibo, `SERVERSQL\SQL2005`).

## 3. Arquitectura

```
BODEGA_DATOS (central) ──► sincronizador PDMC (servidor) ──► catálogo de sitios (dimID_Tienda)
                                                                   │ enlaza tienda PDMC / sucursal CYSN / agente
Tienda  (BD_SPDV)         ─┐                                       ▼
Bodega  (GDC_CASA_MATRIZ) ─┼─► agente (tareas por tipo) ─HTTPS + token─► API CYSN ─► PostgreSQL sistemas_unificados
PC creación (CREACION)    ─┘        latido cada ciclo                                   │
                                                                                         ├─ inventario por sitio ──► PDMC y CYSN
                                                                                         ├─ transferencias / devoluciones / usuarios por sitio ──► PDMC
                                                                                         └─ creacion ──► CYSN
```

### Tareas por tipo de sitio

| Tarea | Tienda | Bodega | PC creación | Destino |
|---|:-:|:-:|:-:|---|
| `inventario` | ✓ | ✓ | | tabla compartida (PDMC y CYSN) |
| `usuarios` | ✓ | ✓ | | PDMC |
| `transferencias` | | ✓ | | PDMC |
| `devoluciones` | | ✓ | | PDMC |
| `creacion` | | | ✓ | CYSN |

Las consultas viajan **dentro del agente**, versionadas junto al `.exe` y copiadas de `consultaPDMC/` y de `app/sync/sql/creacion_origen.sql`. El `config.env` indica `TAREAS=inventario,usuarios,...`.

## 4. Cambios de datos

### Comunes (esquema `cysn_qa`, migraciones `00X_*_up/down.sql`)
- `sucursal.dim_id_tienda` (único) y `sucursal.tipo` (`TIENDA` / `BODEGA` / `CREACION`).
- `agente_sucursal`: el agente queda ligado a un sitio con `dim_id_tienda`.
- `inventario_agente_actual`: añadir `linea` (categoría padre, `LEFT(Codigo, 4)`), que PDMC necesita.
- **Nueva** `agente_fila`, el almacén en bruto para las tareas de PDMC: `(sucursal_id, tarea, clave, datos jsonb, fila_hash, activo, recibido_at)`, única por `(sucursal_id, tarea, clave)`. La clave de cada tarea es:

  | Tarea | Clave de fila |
  |---|---|
  | transferencias, devoluciones | `Numero + CodigoBarra + NumeroCaja` |
  | usuarios | `CodUsuario` |

### PDMC (Prisma, esquema `pdmc`)

| Modelo | Cambio |
|---|---|
| `Ubicacion` | `dimIdTienda` único: enlaza la tienda o bodega con el catálogo |
| `TransferenciaConsulta` | `origenId` (Ubicacion); `numero @unique` pasa a `@@unique([origenId, numero])` |
| `DevolucionConsulta` | igual que transferencias |
| `PerfilLaboral` (facturadores) | `origenId`; `codigo @unique` pasa a `@@unique([origenId, codigo])` ⚠️ ver riesgos |
| `ConsultaInventario` / `InventarioActual` | por sitio: `ubicacionId` |
| `FotoNegativos` | `fechaCorte @unique` pasa a `@@unique([ubicacionId, fechaCorte])` |
| `Negativo` | ya tiene `bodegaId`: se asocia cada sitio con su `Bodega` |
| `Producto` | **sin cambios**: el catálogo por código de barras es común a todos los sitios |

Los importadores de PDMC (`TransferQueryService`, `ReturnsService`, el de facturadores y `InventoryService`) reciben el **sitio** y limitan la comparación y las bajas a ese sitio. El sincronizador de PDMC añade una fuente nueva: en lugar de consultar SQL Server, lee `cysn_qa.agente_fila` de cada sitio con cambios y llama al importador con ese sitio.

## 5. Fases

Cada fase se despliega y se valida antes de pasar a la siguiente.

### Fase 1: catálogo de sitios
1. `sucursales.sql` pasa a la consulta nueva de `BODEGA_DATOS` (ya está en `consultaPDMC/Sucursal - Info.sql`). El importador de tiendas guarda `dimID_Tienda` y el tipo, tienda o bodega (se confirmará qué valores de `Tipo` corresponden a cada uno).
2. Corregir el fallo actual: hoy, una tienda nueva sin región bloquea la carga entera. Pasa a cargarse, quedar marcada "pendiente de región" y generar un aviso.
3. Migraciones para `dimIdTienda` (PDMC) y `dim_id_tienda` (CYSN).
4. **Enlace de lo existente:** un script propone la correspondencia de las 32 tiendas de PDMC y las 59 sucursales de CYSN con su `dimID` (por nombre), y **la revisa una persona** antes de aplicarla.
5. `app.agentes crear --dim-id <dimID>`: el alta usa la identidad común.

**Listo cuando:** todas las tiendas y bodegas activas de `tbDimTiendas` existen en PDMC y en CYSN con el mismo `dimID`, y cada agente queda ligado a uno.

**Implementado (2026-10-21):**
- **Datos de `tbDimTiendas`:** `Tipo 0` = bodega (6) y `Tipo 1` = tienda. `dimID_Tienda` es único, pero `Codigo` se repite (66 filas y 50 códigos). La consulta filtra `Status = 1`; un sitio que deja de llegar se desactiva.
- **PDMC:** la migración `20261021120000_sitios_dim_tiendas` añade a `Ubicacion` los campos `dimIdTienda` (único) y `codigoCorporativo`. El importador `backend/src/tienda/catalogo.ts`:
  - **enlaza por dimID,** o por `Codigo` si es inequívoco y del mismo tipo;
  - **crea los sitios nuevos** (con `Codigo-dimID` si el código se repite) y les asigna la región `SIN-REGION`;
  - **desactiva** los sitios que ya no llegan;
  - **deja para revisar** los casos dudosos, que aparecen en el detalle de la ejecución.

  Las pruebas están en `tests/sitios.integration.mjs`.
- **CYSN:** la migración `004_sitios_dim_tienda` añade `sucursal.dim_id_tienda`. `python -m app.agentes` gana los comandos `proponer-enlaces`, `aplicar-enlaces`, `enlazar` y `crear --dim-id`. La lógica está en `app/sitios.py`, con pruebas en `tests/agente/test_enlace_sitios.py`. Con los datos reales propone 35 enlaces claros de 58; el resto lo revisa una persona.
- **`Inicio-servicios-IAN.bat`:** el sincronizador incluye `SUCURSALES`.

### Fase 2: inventario compartido
1. La consulta del agente añade `linea`. El `.exe` se publica con versión.
2. PDMC lee el inventario **por sitio** desde `cysn_qa.inventario_agente_actual`, con una vista de solo lectura o una consulta dedicada.
3. Negativos y foto semanal por sitio (decisión 6).
4. **Piloto:** `PRUEBA-CM` y una tienda real.

**Listo cuando:** PDMC muestra el inventario y los negativos de cada sitio piloto, y las cifras coinciden con su SQL Server.

**2b-1, desplegada y en marcha (2026-10-27): 18.810 productos de MARACAIBO, iguales en el agente y en PDMC; la primera fotografía de negativos ya está publicada.** El inventario de PDMC deja de leer SQL Server:
- **Módulo `INVENTARIO`:** tiene `fuente: AGENTE_INVENTARIO` y lee `cysn_qa.inventario_agente_actual` de **un solo sitio**, `PDMC_INVENTARIO_DIM_ID` (por defecto 2004, la bodega MARACAIBO), porque el inventario de PDMC sigue siendo uno solo. Así, el inventario de las tiendas no se mezcla con el de la bodega.
- **Qué productos entran:** solo los **activos** y **con categoría**, como la consulta de SQL Server anterior. Antes de releer, se comprueba una firma barata (filas vigentes y último `recibido_at`).
- **Negativos:** se calculan igual que antes, y la primera carga debe publicar la fotografía (`PRIMER_CORTE_REQUERIDO`).
- **El `.bat`:** el sincronizador incluye `INVENTARIO` (`SUCURSALES,FACTURADORES,TRANSFERENCIAS,DEVOLUCIONES,INVENTARIO`). Con esto, **PDMC solo consulta SQL Server para `SUCURSALES`.**
- **Pruebas:** 2 nuevas en `tests/bodegas.integration.mjs`. Pasan las 40 de integración y las 64 unitarias.

**Productos inactivos: no se envían (decisión del 2026-10-26, revisable).**
- **Lo que implica:** un producto inactivo con existencia negativa **no aparece en Negativos**. Con la consulta de SQL Server anterior (`Status IN (1, 0)`) sí aparecía.
- **Para añadirlos en el futuro:**
  1. En el agente (`qa_agent.pending_rows`), enviar también los inactivos en la carga completa, no solo `activo`. La carga inicial pasaría de unas 18.800 filas a unas 201.000 en la bodega MARACAIBO.
  2. En PDMC (`backend/src/sync/agente.ts`, constante `VIGENTE`), quitar el filtro `activo` y mandar `Estado` según `activo`, en lugar del `"1"` fijo.
  3. Recompilar el agente y reinstalarlo en los sitios.

**2b-2 (pendiente):** inventario y negativos por cada sitio en la pantalla, cuando haya más sitios con agente.

### Fase 3: bodegas (transferencias, devoluciones, usuarios)
1. El agente aprende las tareas `transferencias`, `devoluciones` y `usuarios`, con un endpoint `POST /api/agente/v1/filas` (por tarea, por lotes e idempotente, como el de inventario).
2. Migraciones de PDMC: `origenId` y las claves únicas por sitio.
3. El sincronizador de PDMC procesa `agente_fila` por sitio.
4. **Piloto con validación cruzada:** la bodega a la que PDMC apunta hoy. Durante unos días funcionan **los dos caminos a la vez** (el central y el del agente) y se comparan los resultados. Cuando coinciden, se desactiva el camino central para esa bodega.
5. Después, el resto de bodegas.

**Listo cuando:** las transferencias y devoluciones de todas las bodegas se ven en PDMC, cada una con su origen, y una carga de una bodega no afecta a las demás.

**3a, desplegada (2026-10-26):**
- **Agente:** `TAREAS=` en `config.env` (por defecto `inventario`). Las tareas `transferencias`, `devoluciones` y `usuarios` ejecutan su consulta desde la carpeta `consultas` (junto a `config.env`, copias exactas de `consultaPDMC/`), comprueban que es de solo lectura y envían lo nuevo o cambiado y, en el mismo ciclo, lo que desapareció. Su estado va en `enviado_tarea` del SQLite del agente. Si una tarea falla, las demás siguen.
- **API:** `POST /api/agente/v1/filas` → `cysn_qa.agente_fila` (por `dim_id_tienda`, tarea y clave; nunca borra) y `agente_fila_lote` (migración 006). Las claves son: transferencias `Numero + CodigoBarra + NumeroCaja`, devoluciones `Numero` y usuarios `CodUsuario`.
- **Herramientas:** `python -m app.agentes filas --dim-id 2004` y `python -m app.comparar_sitio --dim-id 2004` (compara con `pdmc`: cabeceras y líneas de transferencias, devoluciones y facturadores).
- **Pruebas:** 27 unitarias en `tests/agente/test_tareas_bodega.py`, y una de punta a punta en la base local (agente por HTTP → API → `agente_fila` → comparación con diferencias puestas a propósito).
- **En la bodega hace falta** `GRANT SELECT` sobre `MOVTRANSFERENCIAS`, `TRANSFERENCIAS`, `DEVTRANSFERENCIAS` y `USUARIOS` para `nexoqa_agente`.
- **Desplegada el 2026-10-26.** La bodega Maracaibo envía 145.455 líneas de transferencias, 385 devoluciones y 21 usuarios. La comparación mostró que el agente coincide con PDMC en todo lo anterior al 14/08, y que PDMC leía una copia parada (`SERVERDOS`).

**3b, desplegada el 2026-10-26:**
- **Migración `20261026120000_origen_bodega`:** `TransferenciaConsulta` y `DevolucionConsulta` reciben `origenId` (la `Ubicacion` de la bodega), y el número pasa a ser único por `(origenId, numero)` con `NULLS NOT DISTINCT`. Lo existente se asigna a la bodega 2004.
- **Importadores** (`TransferQueryService.import`, `ReturnsService.import`): reciben la opción `sitio`, con la que comparan y dan de baja solo lo de esa bodega. La huella de la importación incluye el origen. El detalle por número prefiere la transferencia vigente.
- **Sincronizador:** `FACTURADORES`, `TRANSFERENCIAS` y `DEVOLUCIONES` tienen `fuente: AGENTE` y leen `<PDMC_AGENTE_SCHEMA, por defecto cysn_qa>.agente_fila` (`backend/src/sync/agente.ts`), con una importación por bodega. Antes de releer comprueban una firma barata por bodega (filas activas y último `recibido_at`). `SUCURSALES` e `INVENTARIO` siguen con `fuente: SQLSERVER` (el inventario pasará al agente en la fase 2b).
- **Pruebas:** `tests/bodegas.integration.mjs` (8: dos bodegas con el mismo número, bajas sin cruzarse, firma sin cambios, sitio fuera del catálogo) y `tests/migracion-origen.integration.mjs` (2: la migración sobre datos existentes). Pasan las 38 de integración y las 64 unitarias.
- **Decisión:** los **facturadores siguen siendo globales** (`PerfilLaboral.codigo` único), porque son la identidad con la que una cuenta de PDMC se vincula a su facturador (Administración, código permanente). Con una sola bodega no hay conflicto. **Antes de añadir la segunda bodega** hay que decidir qué hacer cuando un código se repita entre bodegas con otra persona.
  - **Mismo pendiente:** `ReporteTransferenciaTienda`, que identifica la transferencia por `(tiendaId, número)`.

### Fase 4: PC de creación
1. Tarea `creacion` en el agente: lee `CREACION` en el PC de creación.
2. El servidor aplica la misma limpieza y comparación que hoy hace `app.sync.creacion`, reutilizando `normalizacion.py`, y se conservan las protecciones: abortar con 0 filas y con más de un 20 % de bajas.
3. Se retira el worker central de CREACION, que nunca pudo conectar.

**Listo cuando:** `cysn_qa.creacion` se actualiza sola desde el PC de creación.

### Fase 5: despliegue a todos los sitios
1. **Alta masiva:** `app.agentes crear-lote` genera, por cada sitio de `tbDimTiendas`, su `config.env` con código, token y tareas según el tipo.
2. Un instalador o script único por sitio: copiar, configurar e instalar el servicio.
3. Aviso automático: una tarea programada en el servidor con `listar --sin-contacto-minutos 5`.
4. Una pantalla de estado de los agentes, en PDMC o en CYSN.
5. Se instala por tandas: 5 sitios, revisión, el resto.

## 6. Riesgos y puntos abiertos

| Riesgo | Mitigación |
|---|---|
| `PerfilLaboral.codigo` es único hoy, y los permisos y alcances de usuarios de PDMC pueden depender de él | Revisarlo al empezar la fase 3; quizá haga falta separar el "perfil de persona" del "código en un sitio" |
| Cambiar claves únicas en tablas con datos (`numero`, `codigo`, `fechaCorte`) | Migraciones en dos pasos: añadir `origenId`, rellenarlo con la bodega actual y después cambiar la clave. Con su `down` y un respaldo antes |
| Más de 60 SQL Server con una lectura completa del inventario cada minuto | Inventarios pequeños, sin problema. Si alguno es grande, subir `SYNC_INTERVAL_SECONDS` para ese sitio |
| Transferencias: decenas de miles de filas por bodega | El agente solo envía los cambios. La primera carga va en lotes de 500 |
| Usuario SQL de solo lectura por sitio (más de 60) | Un script estándar para el DBA, con `GRANT SELECT` solo sobre las tablas de cada tarea |
| Valores exactos de `Tipo` para tienda y bodega | Confirmarlo con la consulta de `tbDimTiendas` al empezar la fase 1 |
| La fecha fija (`06-22-2026`) y el `CASE` fijo de tiendas en la consulta de transferencias | Revisarlos en la fase 3: con `dimID` ya no hace falta mapear nombres |
