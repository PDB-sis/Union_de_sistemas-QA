import { loadEnv } from "../src/env";
import { getDb } from "../src/db";

loadEnv();

async function main() {
  const db = getDb();
  try {
    const counts = await db.$transaction([
      db.usuario.count(), db.bodega.count(), db.producto.count(), db.negativo.count(),
      db.historialNegativo.count(), db.auditoria.count(), db.consultaInventario.count(), db.inventarioActual.count(),
      db.sesionUsuario.count(), db.intentoAcceso.count(), db.ubicacion.count(), db.asignacionAcceso.count(), db.bodegaProducto.count(),
      db.perfilLaboral.count(), db.vinculoOperativo.count(), db.tienda.count(),
      db.reporteTransferenciaTienda.count(), db.inconsistenciaCodigoNoInventario.count(),
      db.transferenciaConsulta.count(), db.transferenciaConsultaImport.count(),
    ]);
    console.info(`Conexión Prisma/PostgreSQL correcta. ${counts.length} entidades accesibles.`);
    console.info(`Registros totales: ${counts.reduce((total, count) => total + count, 0)}. Verificación de solo lectura.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error("No se pudo verificar PostgreSQL. Revisa Docker, DATABASE_URL y el estado de migraciones.");
  process.exitCode = 1;
});
