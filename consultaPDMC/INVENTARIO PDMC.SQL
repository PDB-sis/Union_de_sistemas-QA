SELECT
    I.Status   AS Estado,
    I.CodigoBarra,
    I.Referencia,
    I.Nombre   AS Descripcion,
    I.Existencia,
    C.Nombre   AS Categoria,
    CC.Nombre  AS Linea,
    M.Nombre   AS Marca
FROM dbo.INVENTARIO I
RIGHT JOIN dbo.CATEGORIAS C
       ON I.Categoria = C.Codigo
LEFT JOIN dbo.CATEGORIAS CC
       ON LEFT(C.Codigo, 4) = CC.Codigo
LEFT JOIN dbo.MARCAS M
       ON I.CodigoMarca = M.Codigo
WHERE I.Status IN (1, 0)
ORDER BY I.Existencia DESC;