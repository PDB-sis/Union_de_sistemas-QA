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
    t.DocumentoOrigen

FROM [GDC_CASA_MATRIZ].[dbo].[DEVTRANSFERENCIAS] AS t

LEFT JOIN [GDC_CASA_MATRIZ].[dbo].[USUARIOS] AS u
    ON u.CodUsuario = t.Usuario


WHERE t.Fecha >= CONVERT(datetime, '06-22-2026', 101)

ORDER BY 
    t.Fecha ASC;