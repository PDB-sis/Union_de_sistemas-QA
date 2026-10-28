# Módulo de Tiendas — inicio, reportes y transferencias

## Resultado

El rol Tienda dispone de una experiencia móvil propia en `/tienda`, con inicio, reporte guiado de inconsistencias, transferencias pendientes y casos recientes. La entrada principal redirige allí a las cuentas que tienen `tienda.panel` y no tienen acceso al panel general.

La autoridad permanece en `AsignacionAcceso`. La matriz central incorpora `tienda.panel`, `tienda.transferencias.leer` e `inconsistencias.reportar`; las consultas y altas se limitan a las ubicaciones tipo Tienda autorizadas de forma directa o por región. Los endpoints `/api/tienda` requieren sesión, origen válido y permisos en el servidor.

## Decisiones de datos

Los casos creados en la aplicación se distinguen con `Inconsistencia.origen = APP_TIENDA`. `sheetRow` pasa a ser opcional porque estos casos no nacen en Google Sheets. `sourceKey` se conserva como identificador técnico único y se genera mediante SHA-256 a partir del usuario, la solicitud idempotente y la posición del registro; no simula una fila de hoja.

La importación de Sheets solo reemplaza registros `SHEET`. Un caso `APP_TIENDA` usa `syncStatus = NO_APLICA` y no se envía silenciosamente a la hoja actual. Esto evita que una actualización de Sheets borre reportes creados desde la tienda. Una exportación o bandeja de salida hacia un formato externo requerirá una decisión explícita en otra sesión.

`grupoReporteId` identifica una solicitud de la interfaz y permite reintentar sin duplicar. El servidor serializa solicitudes iguales con un bloqueo transaccional. Para un cruce, crea dos registros en la misma transacción: faltante del producto original y sobrante del producto encontrado, ambos con la misma cantidad, `grupoReporteId` y `claveCruce`. Cada registro incluye auditoría en esa misma transacción; si falla la auditoría se revierte el par completo.

## Flujo de tienda

1. Seleccionar una transferencia pendiente dentro del territorio permitido.
2. Escanear el código con Barcode Detector cuando el navegador lo permita o escribirlo manualmente.
3. Seleccionar Faltante, Sobrante, Cruce de producto, Dañado, Vencido u Otro.
4. En un cruce, identificar también el segundo producto.
5. Indicar una cantidad entera mediante 1, 2, 3, 5 o el campo libre.
6. Confirmar el resultado; un cruce muestra sus dos líneas antes de enviar.

La misma clave de solicitud se conserva mientras la pantalla espera respuesta. Reintentar después de una interrupción devuelve el resultado ya creado.

## Transferencias y vencimientos

La primera versión consume la fotografía de transferencias ya generada por el proyecto y la filtra por el nombre canónico de las tiendas autorizadas. El cálculo está preparado para cinco días hábiles y excluye sábados y domingos. Los feriados requieren una tabla regional futura.

La fuente actual no contiene una fecha de exportación confiable. La interfaz muestra **Sin fecha de exportación** y no inventa vencimientos. Cuando la fuente entregue esa columna, el mismo modelo mostrará vencida, vence hoy, vence mañana o los días hábiles restantes.

## Migración

La migración aditiva `202609230001_modulo_tiendas`:

- agrega los enums `OrigenInconsistencia` y `MotivoReporteTienda`;
- vuelve opcional `Inconsistencia.sheetRow`;
- agrega origen, motivo de tienda, actor, tienda, grupo idempotente y clave de cruce;
- incorpora relaciones e índices para territorio, reportero, grupo y cruce.

No elimina ni transforma inconsistencias existentes. Estas conservan el origen predeterminado `SHEET`.

## Límites de esta entrega

- No envía correo ni WhatsApp.
- No incorpora trabajo sin conexión ni una cola de reintentos persistida en el dispositivo.
- No agrega búsqueda al selector de transferencia.
- No inventa feriados ni fechas ausentes.
- No sincroniza los casos nacidos en la aplicación hacia la hoja de seguimiento existente.

## Verificación

- `tests/shared/tienda.test.mjs`: catálogo, normalización, fechas hábiles y permisos.
- `tests/backend/tienda.integration.mjs`: sesión, API, territorio, producto, alta simple, cruce atómico, auditoría, idempotencia y rollback.
- `tests/frontend/interfaz.browser.mjs`: recorrido móvil de entrada, reporte guiado, persistencia y transferencias.

Para instalar esta versión en otro entorno, ejecutar `npm run db:migrate` antes de iniciar el servidor.
