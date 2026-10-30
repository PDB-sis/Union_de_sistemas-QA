# Consultas automáticas a SQL Server

PDMC ejecuta por sí mismo las consultas de `consultaPDMC` en SQL Server y guarda
el resultado en PostgreSQL. No se cargan archivos CSV.

```text
SQL Server → PDMC ejecuta la consulta (solo lectura) → PostgreSQL
```

## Qué se consulta

| Módulo | Consulta (`backend/sqlserver/consultas/`) | Origen en `consultaPDMC` | Cada |
|---|---|---|---|
| Tiendas | `sucursales.sql` | `Sucursal - Info.sql` | 1 hora |
| Facturadores | `facturadores.sql` | `Usuarios Activos.sql` | 1 hora |
| Transferencias | `transferencias.sql` | `TRANSFERENCIAS NUEVAS.sql` (detalle por producto y caja) | 1 minuto |
| Devoluciones | `devoluciones.sql` | `DEVOLUCIONES.sql` (detalle por producto y caja) | 1 minuto |
| Inventario | `inventario.sql` | `INVENTARIO PDMC.SQL` | 15 minutos |

Los archivos de `backend/sqlserver/consultas/` son copias exactas de `consultaPDMC`.
**Si se modifica una consulta (por ejemplo, la fecha de corte), hay que
actualizar la copia en `backend/sqlserver/consultas/`.** Las consultas solo pueden leer:
PDMC rechaza cualquier instrucción que escriba y ejecuta cada consulta en una
transacción que siempre se deshace.

Las frecuencias se cambian con `PDMC_SYNC_*_SEGUNDOS`. Al arrancar, el proceso
ejecuta primero tiendas y facturadores, para que transferencias y devoluciones
se vinculen a ellos desde la primera vuelta. Cada módulo corre por separado y
cada intervalo empieza a contar cuando termina la ejecución anterior.

## Botones "Actualizar desde SQL Server"

Además de la ejecución automática, cada módulo tiene un botón que consulta SQL
Server en ese momento:

| Dónde | Módulo | Permiso |
|---|---|---|
| Panel de transferencias | Transferencias | `transferencias.importar` |
| Devoluciones | Devoluciones | `devoluciones.importar` |
| Inventario | Inventario | `inventario.administrar` |
| Administración (recuadro de consultas automáticas) | Todos | El de cada módulo; facturadores, `usuarios.administrar` |

El botón lo ejecuta el servidor web, así que el equipo donde corre PDMC debe
poder conectarse a SQL Server. Si la ejecución automática ya está en curso, el
botón avisa y no la duplica.

## Reglas

- **Transferencias y devoluciones** se actualizan solo con INSERT, UPDATE y baja
  lógica, comparando por número de documento:
  - las nuevas se insertan y las modificadas se actualizan;
  - las que ya no aparecen se marcan con `bajaEn` (se ocultan, no se borran) y
    se reactivan si vuelven a aparecer;
  - en el detalle por producto y caja se insertan las líneas nuevas, se
    actualizan las cantidades y se retiran solo las líneas que ya no existen.
- **Tiendas** se actualizan por código. **Facturadores** se crean o actualizan
  por código y vinculan las transferencias y devoluciones que esperaban su perfil.
- **Inventario** reemplaza la fotografía vigente. La carga automática **no**
  publica cortes de negativos: la fotografía semanal se publica a mano con el
  botón **"Publicar fotografía de negativos"** de Inventario (máximo 2 por
  semana), que consulta SQL Server en ese momento. La primera vez hay que
  publicarla: hasta entonces la carga automática falla con
  "PRIMER_CORTE_REQUERIDO".
- Si el resultado es idéntico al anterior, no se importa de nuevo.
- **Una fila inválida rechaza toda la carga** de ese módulo. El error queda en
  `SincronizacionEjecucion` y se muestra en Administración; la información
  anterior se conserva y se reintenta en el siguiente ciclo.
- El inventario se registra a nombre de una cuenta de sistema
  (`PDMC_SYNC_USUARIO_EMAIL`) creada con `npm run sync:crear-usuario -w backend`. No tiene
  contraseña, así que nadie puede iniciar sesión con ella.

## Puesta en marcha

1. **DBA:** ejecutar `backend/sqlserver/01-diagnostico.sql` (solo lectura) y
   `backend/sqlserver/02-usuario-solo-lectura.sql`.
2. **PDMC:** aplicar las migraciones con `npm run db:migrate -w backend`.
3. Completar `PDMC_SQLSERVER_*` y `PDMC_SYNC_USUARIO_EMAIL` en `backend/.env.local` y
   crear la cuenta de sistema: `npm run sync:crear-usuario -w backend`.
4. Probar una vuelta: `npm run sync:sqlserver:once -w backend` (o un módulo con
   `PDMC_SYNC_MODULOS=TRANSFERENCIAS`).
5. En Inventario, pulsar **"Publicar fotografía de negativos"** la primera vez.
6. Iniciar PDMC con `scripts/iniciar-pdmc-red.ps1`. Si `PDMC_SQLSERVER_ENABLED=true`,
   el iniciador arranca también las consultas automáticas (registro en
   `logs/sync-sqlserver-*.log`) y las detiene al cerrarse. Para ejecutarlas
   solas: `npm run sync:sqlserver -w backend`. Si el proceso se cierra de golpe, cada
   módulo se reanuda al vencer su bloqueo (5 minutos; inventario, 20).

## Seguridad

- SQL Server solo se lee. Las credenciales viven en `backend/.env.local` del servidor,
  nunca en el navegador ni en el repositorio.
- Conexión cifrada (TLS). `PDMC_SQLSERVER_TRUST_SERVER_CERTIFICATE=true` solo
  es aceptable con el certificado propio del servidor SQL Server.
