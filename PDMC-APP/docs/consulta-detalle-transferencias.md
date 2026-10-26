# Consulta de detalle de transferencias

La plantilla SQL Server está en `docs/consulta-sqlserver-detalle-transferencias.sql`.

Solo debe adaptarse el CTE `FuenteCorporativa`. Los alias y la consulta final forman el contrato de datos de PDMC y deben conservarse.

## Columnas de salida

| Columna | Uso en PDMC |
| --- | --- |
| `numero` | Enlaza el detalle con la transferencia cargada previamente. |
| `CodTienda` | Valida que el detalle pertenezca a la tienda correcta. |
| `CodFacturador` | Valida el facturador asociado cuando esté disponible. |
| `CodigoBarra` | Identificador textual del producto. |
| `Referencia` | Referencia comercial. |
| `Descripcion` | Nombre o descripción del producto. |
| `Marca` | Marca registrada en el maestro de productos. |
| `Linea` | Línea comercial. |
| `Talla` | Talla del producto. |
| `Cantidad` | Unidades enviadas de ese código. |

La consulta agrupa las líneas repetidas del mismo código dentro de una transferencia. No devuelve cantidades nulas, cero o negativas.

Antes de implementar la carga en PDMC, exporte una muestra pequeña a CSV y confirme que:

- `numero` coincide exactamente con la consulta principal de transferencias;
- `CodTienda` coincide con el código único registrado en Administración;
- `CodigoBarra` conserva los ceros iniciales;
- la suma de `Cantidad` coincide con `suma_cantidades` de la cabecera;
- la cantidad de códigos distintos coincide con `cantidad_codigos`.
