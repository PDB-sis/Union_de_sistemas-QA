# Inventario desde SQL Server

La sección **Carga de inventario** solo aparece al rol Administrador. El inventario ya no se carga con archivos: PDMC ejecuta `backend/sqlserver/consultas/inventario.sql` (copia de `consultaPDMC/INVENTARIO PDMC.SQL`) directamente en SQL Server cada 15 minutos, y el botón **Actualizar desde SQL Server** lo hace en ese momento. Consulte `docs/sincronizacion-sqlserver.md`.

Cada actualización reemplaza la fotografía vigente, actualiza los expedientes de negativos y, en la primera actualización de cada ventana (lunes a miércoles o jueves a domingo), genera el corte LUNES o JUEVES. Una fila inválida impide sustituir la fotografía vigente; el error se muestra en Administración.

La aplicación interpreta `Estado = 1` como activo y `Estado = 0` como inactivo. Cada valor de `Linea` aparece en **Asignación de líneas a bodegas**, donde el Administrador crea o selecciona su bodega real. Esa relación queda guardada en PostgreSQL y las actualizaciones no la cambian; solo cambia cuando el Administrador pulsa **Guardar** en esa línea. La existencia admite valores positivos, cero y negativos.

En **Excepciones por producto** se selecciona una línea y se busca un código, referencia o descripción. La bodega elegida allí prevalece para ese producto sobre la bodega general de la línea. Al escoger **Usar bodega de la línea** se elimina la excepción.
