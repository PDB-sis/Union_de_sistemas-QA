/*
  PDMC - Detalle de productos por transferencia
  Motor: Microsoft SQL Server

  MODIFIQUE SOLAMENTE EL CTE "FuenteCorporativa":
  - tablas o vistas de origen;
  - relaciones JOIN;
  - nombres de columnas, conservando los alias indicados.

  La salida contiene una fila por transferencia y código de barra.
  Los códigos se convierten a texto para que PDMC conserve ceros iniciales.
*/

SET NOCOUNT ON;

WITH FuenteCorporativa AS (
    SELECT
        -- Identificador que coincide con la columna "numero" de la consulta principal.
        cabecera.NumeroTransferencia AS numero_transferencia,

        -- Códigos corporativos estables; no utilice nombres de personas o tiendas.
        cabecera.CodigoTienda       AS codigo_tienda,
        cabecera.CodigoFacturador   AS codigo_facturador,

        -- Producto incluido en la transferencia.
        detalle.CodigoBarra         AS codigo_barra,
        producto.Referencia         AS referencia,
        producto.Descripcion        AS descripcion,
        producto.Marca              AS marca,
        producto.Linea              AS linea,
        producto.Talla              AS talla,

        -- Cantidad enviada para ese producto.
        detalle.Cantidad            AS cantidad
    FROM [CAMBIAR_BASE].[dbo].[CAMBIAR_CABECERA_TRANSFERENCIA] AS cabecera
    INNER JOIN [CAMBIAR_BASE].[dbo].[CAMBIAR_DETALLE_TRANSFERENCIA] AS detalle
        ON detalle.NumeroTransferencia = cabecera.NumeroTransferencia
    LEFT JOIN [CAMBIAR_BASE].[dbo].[CAMBIAR_MAESTRO_PRODUCTOS] AS producto
        ON producto.CodigoBarra = detalle.CodigoBarra
    WHERE 1 = 1
      -- Agregue aquí únicamente los filtros corporativos necesarios.
      -- Ejemplo: AND cabecera.Estado <> 'Anulada'
),
Normalizada AS (
    SELECT
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(128), numero_transferencia))), '') AS numero,
        NULLIF(UPPER(LTRIM(RTRIM(CONVERT(varchar(80), codigo_tienda)))), '') AS CodTienda,
        NULLIF(UPPER(LTRIM(RTRIM(CONVERT(varchar(80), codigo_facturador)))), '') AS CodFacturador,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(128), codigo_barra))), '') AS CodigoBarra,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(200), referencia))), '') AS Referencia,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(500), descripcion))), '') AS Descripcion,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(200), marca))), '') AS Marca,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(200), linea))), '') AS Linea,
        NULLIF(LTRIM(RTRIM(CONVERT(varchar(100), talla))), '') AS Talla,
        TRY_CONVERT(decimal(18, 4), cantidad) AS Cantidad
    FROM FuenteCorporativa
)
SELECT
    numero,
    CodTienda,
    CodFacturador,
    CodigoBarra,
    MAX(Referencia)  AS Referencia,
    MAX(Descripcion) AS Descripcion,
    MAX(Marca)       AS Marca,
    MAX(Linea)       AS Linea,
    MAX(Talla)       AS Talla,
    SUM(Cantidad)    AS Cantidad
FROM Normalizada
WHERE numero IS NOT NULL
  AND CodTienda IS NOT NULL
  AND CodigoBarra IS NOT NULL
  AND Cantidad IS NOT NULL
  AND Cantidad > 0
GROUP BY
    numero,
    CodTienda,
    CodFacturador,
    CodigoBarra
HAVING SUM(Cantidad) > 0
ORDER BY
    numero,
    CodigoBarra;

