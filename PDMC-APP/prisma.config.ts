import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Misma precedencia de variables que Next.js; no muestra valores ni secretos.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "backend/prisma/schema.prisma",
  migrations: {
    path: "backend/prisma/migrations",
    seed: "tsx backend/prisma/seed.ts",
  },
  // Generate y build no requieren conexión. Migrate falla si no está configurada.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
