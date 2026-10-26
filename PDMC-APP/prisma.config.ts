import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Misma precedencia de variables que Next.js; no muestra valores ni secretos.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Generate y build no requieren conexión. Migrate falla si no está configurada.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
