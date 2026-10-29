<#
.SYNOPSIS
  Revisa que el inventario, las transferencias y las devoluciones que envía el agente de una
  bodega (o tienda) estén llegando al PostgreSQL del servidor y que PDMC los haya cargado.

.DESCRIPTION
  Solo lee (SELECT); no modifica nada. Pide la contraseña de PostgreSQL sin mostrarla.

  1. Agente: activo y último contacto.
  2. Envíos recibidos por la API (lotes) por tarea: último y últimas 24 h.
  3. Datos guardados en cysn_qa (lo que envió el agente).
  4. Datos cargados en PDMC (esquema pdmc) para ese sitio y comparación con el agente.
  5. Estado de las sincronizaciones automáticas de PDMC.

.EXAMPLE
  .\Revisar-Datos-Bodega.ps1                 # MARACAIBO (2004)
  .\Revisar-Datos-Bodega.ps1 -DimId 2005     # otra bodega
  .\Revisar-Datos-Bodega.ps1 -DimId 1011     # una tienda (solo envía inventario)
#>
param(
  [int]$DimId = 2004,
  # Sitio del que PDMC toma su único inventario (PDMC_INVENTARIO_DIM_ID).
  [int]$DimInventarioPdmc = 2004,
  [string]$PgHost = '127.0.0.1',
  [int]$Puerto = 5432,
  [string]$Base = 'sistemas_unificados',
  [string]$Usuario = 'postgres'
)
$ErrorActionPreference = 'Stop'

$psql = Get-Command psql -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $psql) {
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { throw 'No se encontró psql.exe. Instale las herramientas de cliente de PostgreSQL.' }

$sql = @"
\pset footer off
SET TimeZone = 'America/Caracas';
\echo
\echo '=== 1. Agente del sitio $DimId ==='
SELECT a.codigo, a.activo,
       to_char(a.ultimo_contacto_at, 'DD/MM/YYYY HH24:MI:SS') AS ultimo_contacto,
       round(extract(epoch FROM now() - a.ultimo_contacto_at) / 60) AS minutos_sin_contacto,
       CASE WHEN NOT a.activo THEN 'DESACTIVADO'
            WHEN a.ultimo_contacto_at IS NULL THEN 'NUNCA HA CONECTADO'
            WHEN now() - a.ultimo_contacto_at > interval '15 minutes' THEN 'SIN CONTACTO RECIENTE'
            ELSE 'OK' END AS estado
  FROM cysn_qa.agente_sucursal a
  LEFT JOIN cysn_qa.sucursal s ON s.id = a.sucursal_id
 WHERE COALESCE(a.dim_id_tienda, s.dim_id_tienda) = $DimId;

\echo '=== 2. Envios recibidos por la API (lotes) ==='
WITH ag AS (
  SELECT a.id FROM cysn_qa.agente_sucursal a LEFT JOIN cysn_qa.sucursal s ON s.id = a.sucursal_id
   WHERE COALESCE(a.dim_id_tienda, s.dim_id_tienda) = $DimId),
lotes AS (
  SELECT 'inventario' AS tarea, modo, filas_recibidas, recibido_at FROM cysn_qa.inventario_agente_lote WHERE agente_sucursal_id IN (SELECT id FROM ag)
  UNION ALL
  SELECT tarea, modo, filas_recibidas, recibido_at FROM cysn_qa.agente_fila_lote WHERE agente_sucursal_id IN (SELECT id FROM ag))
SELECT t.tarea,
       to_char(max(l.recibido_at), 'DD/MM/YYYY HH24:MI:SS') AS ultimo_envio,
       count(l.*) FILTER (WHERE l.recibido_at > now() - interval '24 hours') AS envios_24h,
       COALESCE(sum(l.filas_recibidas) FILTER (WHERE l.recibido_at > now() - interval '24 hours'), 0) AS filas_24h,
       count(l.*) AS envios_total
  FROM (VALUES ('inventario'), ('transferencias'), ('devoluciones'), ('usuarios')) AS t(tarea)
  LEFT JOIN lotes l ON l.tarea = t.tarea
 GROUP BY t.tarea ORDER BY t.tarea;

\echo '=== 3. Datos guardados del agente (cysn_qa) ==='
SELECT 'inventario' AS tarea,
       count(*) FILTER (WHERE activo AND nombre_categoria IS NOT NULL) AS vigentes,
       count(*) FILTER (WHERE NOT activo) AS dados_de_baja,
       NULL::bigint AS documentos,
       to_char(max(recibido_at), 'DD/MM/YYYY HH24:MI:SS') AS ultimo_cambio
  FROM cysn_qa.inventario_agente_actual WHERE dim_id_tienda = $DimId
UNION ALL
SELECT t.tarea,
       count(f.*) FILTER (WHERE f.activo),
       count(f.*) FILTER (WHERE NOT f.activo),
       count(DISTINCT f.datos->>'Numero') FILTER (WHERE f.activo AND t.tarea <> 'usuarios'),
       to_char(max(f.recibido_at), 'DD/MM/YYYY HH24:MI:SS')
  FROM (VALUES ('transferencias'), ('devoluciones'), ('usuarios')) AS t(tarea)
  LEFT JOIN cysn_qa.agente_fila f ON f.tarea = t.tarea AND f.dim_id_tienda = $DimId
 GROUP BY t.tarea;

\echo '=== 4. Cargado en PDMC frente al agente ==='
WITH sitio AS (SELECT id, nombre FROM pdmc."Ubicacion" WHERE "dimIdTienda" = $DimId),
agente AS (
  SELECT tarea, count(DISTINCT datos->>'Numero') AS docs, max(NULLIF(regexp_replace(datos->>'Numero', '\D', '', 'g'), '')::numeric) AS ultimo
    FROM cysn_qa.agente_fila WHERE dim_id_tienda = $DimId AND activo AND tarea IN ('transferencias', 'devoluciones') GROUP BY tarea),
pdmc_docs AS (
  SELECT 'transferencias' AS tarea, count(*) FILTER (WHERE "bajaEn" IS NULL) AS docs,
         max(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::numeric) FILTER (WHERE "bajaEn" IS NULL) AS ultimo,
         max("updatedAt") AS actualizado
    FROM pdmc."TransferenciaConsulta" WHERE "origenId" IN (SELECT id FROM sitio)
  UNION ALL
  SELECT 'devoluciones', count(*) FILTER (WHERE "bajaEn" IS NULL),
         max(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::numeric) FILTER (WHERE "bajaEn" IS NULL),
         max("updatedAt")
    FROM pdmc."DevolucionConsulta" WHERE "origenId" IN (SELECT id FROM sitio))
SELECT (SELECT nombre FROM sitio) AS sitio_pdmc, p.tarea,
       COALESCE(a.docs, 0) AS docs_agente, p.docs AS docs_pdmc,
       a.ultimo AS ultimo_num_agente, p.ultimo AS ultimo_num_pdmc,
       to_char(p.actualizado, 'DD/MM/YYYY HH24:MI:SS') AS ultimo_cambio_pdmc,
       CASE WHEN (SELECT count(*) FROM sitio) = 0 THEN 'SITIO NO EXISTE EN PDMC'
            WHEN COALESCE(a.docs, 0) = p.docs THEN 'OK' ELSE 'DIFERENTE' END AS estado
  FROM pdmc_docs p LEFT JOIN agente a ON a.tarea = p.tarea
UNION ALL
SELECT (SELECT nombre FROM sitio), 'inventario',
       (SELECT count(*) FROM cysn_qa.inventario_agente_actual WHERE dim_id_tienda = $DimId AND activo AND nombre_categoria IS NOT NULL),
       (SELECT count(*) FROM pdmc."InventarioActual" WHERE activo),
       NULL, NULL,
       (SELECT to_char(max("fechaImportacion"), 'DD/MM/YYYY HH24:MI:SS') FROM pdmc."ConsultaInventario"),
       CASE WHEN $DimId <> $DimInventarioPdmc THEN 'NO APLICA'
            WHEN (SELECT count(*) FROM pdmc."InventarioActual" WHERE activo) = 0 THEN 'PDMC SIN INVENTARIO'
            WHEN (SELECT count(*) FROM pdmc."InventarioActual" WHERE activo) =
                 (SELECT count(*) FROM cysn_qa.inventario_agente_actual WHERE dim_id_tienda = $DimId AND activo AND nombre_categoria IS NOT NULL) THEN 'OK'
            ELSE 'DIFERENTE' END;

\echo '=== 5. Sincronizaciones automaticas de PDMC ==='
SELECT modulo,
       to_char("ultimoExitoEn", 'DD/MM/YYYY HH24:MI:SS') AS ultimo_exito,
       to_char("ultimoIntentoEn", 'DD/MM/YYYY HH24:MI:SS') AS ultimo_intento,
       CASE WHEN "ultimoError" IS NULL THEN 'OK' ELSE left(regexp_replace("ultimoError", '\s+', ' ', 'g'), 120) END AS error
  FROM pdmc."SincronizacionEstado" ORDER BY modulo;
"@

$clave = Read-Host "Contraseña de PostgreSQL para '$Usuario'" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
$env:PGCLIENTENCODING = 'UTF8'
try {
  # UTF-8 al enviar el SQL a psql y al leer su salida (los títulos llevan acentos).
  $OutputEncoding = [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
  $sql | & $psql -h $PgHost -p $Puerto -U $Usuario -d $Base -X -q -v ON_ERROR_STOP=1 -f -
  if ($LASTEXITCODE -ne 0) { throw "psql terminó con código $LASTEXITCODE." }
  Write-Host ''
  Write-Host 'Cómo leerlo:'
  Write-Host ' - 1: el agente debe estar OK (contacto en los últimos 15 minutos).'
  Write-Host ' - 2: ultimo_envio solo cambia cuando hay datos nuevos; sin cambios el agente solo envía latidos.'
  Write-Host ' - 4: docs_agente y docs_pdmc deben coincidir. Si difieren, pulse "Actualizar ahora" en PDMC y repita.'
  Write-Host '   En inventario, docs_pdmc es el inventario vigente de PDMC, que sale de un solo sitio'
  Write-Host '   (PDMC_INVENTARIO_DIM_ID, por defecto 2004). En los demás sitios sale NO APLICA.'
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
