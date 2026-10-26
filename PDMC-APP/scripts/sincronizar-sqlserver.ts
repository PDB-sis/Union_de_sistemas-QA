import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getDb } from "../backend/src/db";
import { ejecutarModulo } from "../backend/src/sync/ejecutar";
import { modulosActivos, type Modulo } from "../backend/src/sync/modulos";
import { closeSqlServerPool, sqlServerSyncEnabled } from "../backend/src/sync/sqlserver";

const once = process.argv.includes("--once");
let stopping = false;
const sleepers = new Set<() => void>();

function wait(milliseconds: number) {
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); sleepers.delete(done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    sleepers.add(done);
  });
}

function log(modulo: Modulo, message: string) {
  console.info(new Date().toISOString() + " [" + modulo.id + "] " + message);
}

async function ejecutar(db: ReturnType<typeof getDb>, modulo: Modulo) {
  // Un fallo de PostgreSQL no debe detener el ciclo; se reintenta en el siguiente.
  const result = await ejecutarModulo(db, modulo).catch(error => ({
    estado: "FALLIDA" as const,
    error: error instanceof Error ? error.message : "Error desconocido.",
  }));
  if (result.estado === "FALLIDA") console.error(new Date().toISOString() + " [" + modulo.id + "] FALLIDA: " + result.error);
  else if (result.estado === "OMITIDA") log(modulo, "Omitida: otro proceso la esta ejecutando.");
  else log(modulo, result.estado + " (" + result.totalFilas + " filas).");
}

async function ciclo(db: ReturnType<typeof getDb>, modulo: Modulo, yaEjecutado: boolean) {
  if (!yaEjecutado) await ejecutar(db, modulo);
  // El intervalo cuenta desde que termina la ejecución: nunca se solapan.
  while (!once && !stopping) {
    await wait(modulo.intervaloSegundos() * 1_000);
    if (!stopping) await ejecutar(db, modulo);
  }
}

async function run() {
  if (!sqlServerSyncEnabled()) {
    console.info("Sincronizacion SQL Server desactivada. Configure PDMC_SQLSERVER_ENABLED=true para iniciarla.");
    return;
  }
  const modulos = modulosActivos();
  const db = getDb();
  const stop = () => { stopping = true; for (const done of [...sleepers]) done(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    // Primero los catálogos (tiendas y facturadores), para que transferencias y
    // devoluciones se vinculen a ellos desde la primera vuelta.
    const catalogos = modulos.filter(modulo => modulo.catalogo);
    for (const modulo of catalogos) if (!stopping) await ejecutar(db, modulo);
    // Cada módulo tiene su propio ciclo: el inventario largo no retrasa las transferencias.
    await Promise.all(modulos.map(modulo => ciclo(db, modulo, modulo.catalogo)));
  } finally {
    await closeSqlServerPool().catch(() => undefined);
    await db.$disconnect();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : "No fue posible iniciar el worker SQL Server.");
  process.exitCode = 1;
});
