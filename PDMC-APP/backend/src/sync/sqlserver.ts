import sql from "mssql";
import { assertReadOnlyQuery } from "./solo-lectura";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function bool(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(name + " debe ser true o false.");
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Configura " + name + " para activar la sincronizacion SQL Server.");
  return value;
}

export function numberEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(name + " debe estar entre " + minimum + " y " + maximum + ".");
  }
  return value;
}

export function sqlServerSyncEnabled() {
  return bool("PDMC_SQLSERVER_ENABLED", false);
}

async function pool() {
  if (!poolPromise) {
    // Instancia con nombre (SERVIDOR\INSTANCIA): el puerto lo resuelve el
    // servicio SQL Server Browser, salvo que se indique uno fijo.
    const instanceName = process.env.PDMC_SQLSERVER_INSTANCE?.trim() || undefined;
    const port = instanceName && !process.env.PDMC_SQLSERVER_PORT ? undefined : numberEnv("PDMC_SQLSERVER_PORT", 1433, 1, 65535);
    poolPromise = new sql.ConnectionPool({
      server: required("PDMC_SQLSERVER_HOST"),
      port,
      database: required("PDMC_SQLSERVER_DATABASE"),
      user: required("PDMC_SQLSERVER_USER"),
      password: required("PDMC_SQLSERVER_PASSWORD"),
      connectionTimeout: 15_000,
      // El inventario completo puede tardar varios minutos.
      requestTimeout: numberEnv("PDMC_SQLSERVER_TIMEOUT_SECONDS", 300, 10, 3_600) * 1_000,
      pool: { max: 3, min: 0, idleTimeoutMillis: 30_000 },
      options: {
        instanceName,
        encrypt: true,
        trustServerCertificate: bool("PDMC_SQLSERVER_TRUST_SERVER_CERTIFICATE", false),
      },
    }).connect();
    void poolPromise?.catch(() => { poolPromise = undefined; });
  }
  return poolPromise;
}

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[] };

/**
 * Ejecuta una consulta de solo lectura y devuelve sus columnas en el orden
 * original. Además de validarla, la ejecuta dentro de una transacción que
 * siempre se deshace: aunque algo intentara escribir, no quedaría ningún cambio.
 */
export async function runQuery(text: string): Promise<QueryResult> {
  assertReadOnlyQuery(text);
  const transaction = new sql.Transaction(await pool());
  await transaction.begin();
  try {
    const result = await new sql.Request(transaction).query(text);
    const recordset = result.recordset;
    if (!recordset) throw new Error("La consulta SQL Server no devolvio resultados.");
    const columns = Object.values(recordset.columns)
      .sort((a, b) => a.index - b.index)
      .map(column => column.name);
    return { columns, rows: [...recordset] as Record<string, unknown>[] };
  } finally {
    await transaction.rollback().catch(() => undefined);
  }
}

export async function closeSqlServerPool() {
  if (!poolPromise) return;
  const connected = await poolPromise;
  poolPromise = undefined;
  await connected.close();
}
