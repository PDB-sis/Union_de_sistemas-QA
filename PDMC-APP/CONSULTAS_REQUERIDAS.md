# Consultas requeridas por PDMC

PDMC trabaja actualmente con tres cargas operativas. Los archivos deben guardarse como CSV o TXT en UTF-8, según se indica en cada módulo. Los códigos se comparan sin distinguir mayúsculas y minúsculas, pero deben conservar el identificador corporativo estable.

## 1. Inventario

Fuente de productos, existencias vigentes y negativos. Encabezados obligatorios (el orden puede variar):

```text
Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea
```

`Marca` es opcional y recomendable. `CodigoBarra` se guarda como texto. `Linea` es obligatoria y se usa para asignar la bodega operativa. `Estado` acepta `Activo/Inactivo`, `Sí/No`, `1/0` o `true/false`. La existencia admite decimales sin separador de miles. Los negativos se generan desde esta carga; no requieren otra consulta independiente.

## 2. Transferencias detalladas

Fuente de transferencias y productos por caja. El orden es obligatorio:

```text
Numero;fecha_formateada;CodNombre;CodigoBarra;Cantidad;NumeroCaja;codigoRecibe_Dletra;status;observacion
```

- `CodNombre`: código corporativo estable del facturador.
- `codigoRecibe_Dletra`: código corporativo estable de la tienda.
- `fecha_formateada`: fecha `MM/DD/AAAA`.
- `status`: `Abierta`, `Aprobada` o `Exportada`.
- `Cantidad`: entero mayor que cero.

El código del facturador se enlaza con la cuenta de rol **Facturación** y el código de la tienda con la tienda creada en Administración. Los códigos de barra se enlazan con el catálogo del inventario.

## 3. Devoluciones detalladas

Fuente de devoluciones y sus productos. El orden es obligatorio:

```text
Numero;fecha_formateada;CodNombre;CodigoBarra;Cantidad;NumeroCaja;codigoRecibe_Dletra;status;Observacion
```

Acepta los estados `Abierta` y `Exportada`. `CodNombre`, tienda y productos usan los mismos códigos estables descritos para transferencias.

## Catálogos administrados dentro de PDMC

Regiones, tiendas y usuarios se crean desde Administración. Una tienda requiere región y código corporativo. Un usuario de Facturación requiere región y su código corporativo; al crearlo, PDMC enlaza también las transferencias y devoluciones ya cargadas con ese código.

El catálogo masivo de facturadores es opcional para una carga inicial y usa:

```text
CodUsuario;NombreUsuario
```

Las inconsistencias, reportes de tienda, observaciones, seguimientos y métricas se generan dentro de PDMC; no necesitan consultas externas.
