import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

loadEnvConfig(process.cwd());

async function main() {
  const codigo = process.env.SEED_BODEGA_CODIGO?.trim();
  const nombre = process.env.SEED_BODEGA_NOMBRE?.trim();
  if (!codigo && !nombre) {
    console.info("Seed omitido: no se configuró una bodega real. No se crearon registros.");
    return;
  }
  if (!codigo || !nombre || codigo.length > 80 || nombre.length > 200) {
    throw new Error("Configuración de bodega incompleta o inválida.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }), log: [] });
  try {
    await db.$transaction(async (tx) => {
      const bodega = await tx.bodega.findUnique({ where: { codigo } });
      if (bodega) return;
      const creada = await tx.bodega.create({ data: { codigo, nombre } });
      await tx.auditoria.create({ data: {
        entidad: "Bodega", entidadId: creada.id, accion: "CREACION_SEED",
        motivo: "Alta explícita de bodega real mediante configuración del operador.",
        valorNuevo: { codigo, nombre },
      } });
    }, { isolationLevel: "Serializable" });
    console.info("Seed completado. Los registros existentes se conservaron.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  // Los errores del driver pueden contener la conexión; no volcarlos al log.
  console.error("Seed no aplicado. Revisa conexión, migraciones y configuración de bodega.");
  process.exitCode = 1;
});
