import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalDb = globalThis as unknown as { pdmcDb?: PrismaClient };

// Inicialización diferida: el prototipo aún funciona sin PostgreSQL.
// Importar únicamente desde Server Components, Route Handlers o servicios servidor.
export function getDb(): PrismaClient {
  if (globalDb.pdmcDb) return globalDb.pdmcDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configura DATABASE_URL en el servidor para usar PostgreSQL.");
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema)) throw new Error("Esquema PostgreSQL inválido.");
  globalDb.pdmcDb = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000, options: `-c search_path=${schema}` }, { schema }),
    log: [],
  });
  return globalDb.pdmcDb;
}
