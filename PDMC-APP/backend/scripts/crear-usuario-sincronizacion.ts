import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getDb } from "../src/db";
import { ensureSyncUser } from "../src/sync/usuario-sistema";

async function main() {
  const db = getDb();
  try {
    const result = await ensureSyncUser(db, process.env.PDMC_SYNC_USUARIO_EMAIL);
    console.info((result.creado ? "Cuenta de sincronizacion creada: " : "Cuenta de sincronizacion verificada: ") + result.email + ". No tiene contrasena y no puede iniciar sesion.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "No se pudo preparar la cuenta de sincronizacion. Revise PDMC_SYNC_USUARIO_EMAIL.");
  process.exitCode = 1;
});
