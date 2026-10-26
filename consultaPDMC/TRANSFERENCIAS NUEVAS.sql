SELECT 
    -- Datos del Detalle (Movimiento)
    m.Numero,
    CONVERT(varchar, m.Fecha, 101) AS fecha_formateada,

    -- Código del Usuario ubicado arriba (CodNombre)[cite: 5]
    ISNULL(u.CodUsuario, 'Usuario no encontrado') AS CodNombre,

    m.CodigoBarra,
    m.Cantidad,
    m.NumeroCaja,

    -- Codigo unico de la tienda, sin listas manuales ni conversion a nombre.
    t.codigoRecibe AS codigoRecibe_Dletra,

    -- Estatus de la transferencia
    CASE
        WHEN t.status = 0 THEN 'Abierta' 
        WHEN t.status = 1 THEN 'Aprobada'
        WHEN t.status = 2 THEN 'Exportada'
        ELSE 'Desconocido' 
    END AS status,

    t.observacion

FROM [GDC_CASA_MATRIZ].[dbo].[MOVTRANSFERENCIAS] AS m

-- Unimos con la tabla TRANSFERENCIAS para obtener los datos generales
LEFT JOIN [GDC_CASA_MATRIZ].[dbo].[TRANSFERENCIAS] AS t
    ON m.Numero = t.numero

-- Unimos con la tabla USUARIOS utilizando el usuario de la transferencia
LEFT JOIN [GDC_CASA_MATRIZ].[dbo].[USUARIOS] AS u
    ON u.CodUsuario = t.usuario

WHERE m.Fecha >= CONVERT(datetime, '06-22-2026', 101)

ORDER BY 
    m.Fecha ASC, 
    m.Numero ASC;