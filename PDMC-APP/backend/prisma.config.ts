import { loadEnv } from "./src/env";
import { defineConfig } from "prisma/config";

// Variables del backend (backend/.env.local); no muestra valores ni secretos.
loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Generate y build no requieren conexión. Migrate falla si no está configurada.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
