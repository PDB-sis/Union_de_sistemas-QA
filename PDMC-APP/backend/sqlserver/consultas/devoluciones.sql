WITH lineas AS (
    -- Detalle de la devolución por producto y caja (como las transferencias).
    -- Se agrupa por código y caja para que cada línea sea única.
    SELECT
        m.Numero,
        m.CodigoBarra,
        m.NumeroCaja,
        SUM(m.Cantidad) AS Cantidad
    FROM [GDC_CASA_MATRIZ].[dbo].[MOVDEVTRANSFERENCIAS] AS m
    WHERE m.Numero IN (
        SELECT d.Numero
        FROM [GDC_CASA_MATRIZ].[dbo].[DEVTRANSFERENCIAS] AS d
        WHERE d.Fecha >= CONVERT(datetime, '06-22-2026', 101)
    )
    GROUP BY m.Numero, m.CodigoBarra, m.NumeroCaja
)
SELECT
    t.Numero,
    CONVERT(varchar, t.Fecha, 101) AS fecha_formateada,

    -- Codigo del usuario (enlaza con el facturador en PDMC) y su nombre
    ISNULL(u.CodUsuario, 'Usuario no encontrado') AS CodNombre,
    ISNULL(u.NombreUsuario, 'Usuario no encontrado') AS usuario,

    -- Codigo unico de la tienda: incluye tiendas nuevas sin mantener listas manuales.
    t.CodigoRecibe AS codigoRecibe_Dletra,

    CASE
        WHEN t.Status = 0 THEN 'Abierta'
        WHEN t.Status = 1 THEN 'Aprobada'
        WHEN t.Status = 2 THEN 'Exportada'
        ELSE 'Desconocido'
    END AS status,

    t.Observacion,
    t.TotalValor,
    t.DocumentoOrigen,

    -- Producto, cantidad y caja de cada línea (vacíos si la devolución no tiene productos)
    l.CodigoBarra,
    l.Cantidad,
    l.NumeroCaja,

    -- Cuántas líneas tiene la devolución: PDMC comprueba que llegó el detalle completo.
    COUNT(l.CodigoBarra) OVER (PARTITION BY t.Numero) AS LineasDevolucion

FROM [GDC_CASA_MATRIZ].[dbo].[DEVTRANSFERENCIAS] AS t

LEFT JOIN lineas AS l
    ON l.Numero = t.Numero

LEFT JOIN [GDC_CASA_MATRIZ].[dbo].[USUARIOS] AS u
    ON u.CodUsuario = t.Usuario


WHERE t.Fecha >= CONVERT(datetime, '06-22-2026', 101)

ORDER BY
    t.Fecha ASC,
    t.Numero ASC,
    l.NumeroCaja ASC,
    l.CodigoBarra ASC;