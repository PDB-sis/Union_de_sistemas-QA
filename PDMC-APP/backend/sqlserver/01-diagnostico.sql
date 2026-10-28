-- Diagnóstico previo a las consultas automáticas. Solo lectura: no modifica nada.
-- Ejecutar en SQL Server Management Studio y compartir los resultados.

USE [GDC_CASA_MATRIZ];
GO

-- 1. Tiempo y volumen de cada consulta (deben caber en los intervalos:
--    transferencias 1 min, sucursales 1 h, inventario 15 min).
SET STATISTICS TIME ON;

SELECT COUNT(*) AS filas_transferencias
FROM dbo.TRANSFERENCIAS AS t
INNER JOIN (
    SELECT numero FROM dbo.MOVTRANSFERENCIAS
    WHERE fecha >= CONVERT(datetime, '06-22-2026', 101)
    GROUP BY numero
) AS m ON t.numero = m.numero;

SELECT COUNT(*) AS filas_inventario
FROM dbo.INVENTARIO I
RIGHT JOIN dbo.CATEGORIAS C ON I.Categoria = C.Codigo
WHERE I.Status IN (1, 0);

SET STATISTICS TIME OFF;

-- 2. Datos que PDMC rechazaría (hoy también rechazaría el CSV manual).
--    Transferencias: estados desconocidos y cantidades negativas o con decimales.
SELECT status, COUNT(*) AS total
FROM dbo.TRANSFERENCIAS
GROUP BY status;

SELECT COUNT(*) AS transferencias_con_cantidad_invalida
FROM (
    SELECT numero, SUM(cantidad) AS suma
    FROM dbo.MOVTRANSFERENCIAS
    WHERE fecha >= CONVERT(datetime, '06-22-2026', 101)
    GROUP BY numero
) AS x
WHERE x.suma < 0 OR x.suma <> FLOOR(x.suma);

--    Inventario: productos sin línea (obligatoria en PDMC) y códigos repetidos.
SELECT COUNT(*) AS inventario_sin_linea
FROM dbo.INVENTARIO AS I
JOIN dbo.CATEGORIAS AS C ON I.Categoria = C.Codigo
LEFT JOIN dbo.CATEGORIAS AS CC ON LEFT(C.Codigo, 4) = CC.Codigo
WHERE I.Status IN (1, 0) AND CC.Codigo IS NULL;

SELECT TOP (20) I.CodigoBarra, CC.Nombre AS Linea, COUNT(*) AS repeticiones
FROM dbo.INVENTARIO AS I
JOIN dbo.CATEGORIAS AS C ON I.Categoria = C.Codigo
LEFT JOIN dbo.CATEGORIAS AS CC ON LEFT(C.Codigo, 4) = CC.Codigo
WHERE I.Status IN (1, 0)
GROUP BY I.CodigoBarra, CC.Nombre
HAVING COUNT(*) > 1;
