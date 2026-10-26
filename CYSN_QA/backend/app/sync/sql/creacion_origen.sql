-- ============================================================
-- Consulta origen CREACION (SQL Server) - SOLO LECTURA
--
-- Copia exacta de la consulta del nodo n8n
-- "RECOPILACION DE CREACION".
--
-- Diferencia única: se omite "USE CREACION;" porque la base de
-- datos se fija en la cadena de conexión (CYSN_SQLSERVER_DATABASE).
-- Cualquier cambio a esta consulta debe versionarse en git.
-- ============================================================

;WITH TasaReciente AS (
    SELECT TOP (1)
        Valor,
        Fecha
    FROM dbo.TASA_CAMBIO
    ORDER BY Fecha DESC
),
Parametro AS (
    SELECT TOP (1)
        nombre
    FROM dbo.PARAMETROS
)

SELECT
    TR.Valor AS TasaCambio,
    CONVERT(VARCHAR(19), TR.Fecha, 120) AS FECHA_TASA_CAMBIO,

    P.nombre AS SUCURSAL,

    I.CodigoBarra,
    I.Referencia,
    I.CodigoMarca AS CodigoMarcaOrigen,
    I.Referencia + CAST(I.CodigoMarca AS VARCHAR) AS Concatenado,

    M.Nombre AS Marca,

    I.Nombre AS Descripcion,

    -- Categoría
    C.Codigo AS CodigoCategoria,
    C.Nombre AS NombreCategoria,

    I.Status,
    I.Existencia,

    -- Costos
    I.CostoDolar,
    I.CostoInicial,

    -- Precio promoción
    I.PrecioPromocion,

    -- Precios
    ROUND((I.PrecioDetal * 1.16) / TR.Valor, 2) AS PrecioDetalUSDMasIVA,
    ROUND((I.PrecioDetal * 1.16), 2) AS PrecioDetalMasIVA,

    ROUND((I.PrecioMayor * 1.16) / TR.Valor, 2) AS PrecioMayorUSDMasIVA,
    ROUND((I.PrecioMayor * 1.16), 2) AS PrecioMayorMasIVA

FROM dbo.INVENTARIO I

LEFT JOIN dbo.MARCAS M
    ON I.CodigoMarca = M.Codigo

LEFT JOIN dbo.CATEGORIAS C
    ON I.Categoria = C.Codigo

CROSS JOIN TasaReciente TR
CROSS JOIN Parametro P

WHERE I.Status = 1;
