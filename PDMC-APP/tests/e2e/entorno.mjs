// Utilidades de las pruebas de punta a punta (backend + frontend juntos, en Edge sin interfaz).
// Requieren el frontend compilado (npm run build -w frontend) y PostgreSQL local; cada prueba
// crea un esquema aislado. Las capturas y perfiles temporales quedan en tests/e2e/.salida.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const aqui = dirname(fileURLToPath(import.meta.url));
export const backendDir = resolve(aqui, "../../backend");
export const salida = resolve(aqui, ".salida");
mkdirSync(salida, { recursive: true });

/** Variables del backend (backend/.env.local, .env; luego PDMC-APP/), sin pisar las del sistema. */
export function cargarEntorno() {
  for (const dir of [backendDir, resolve(backendDir, "..")]) for (const name of [".env.local", ".env"]) {
    const file = resolve(dir, name);
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) if (process.env[key] === undefined) process.env[key] = value;
  }
  if (!existsSync(resolve(backendDir, "../frontend/dist/index.html"))) throw new Error("Compile el frontend antes de las pruebas de navegador: npm run build -w frontend.");
}

/** Argumentos para ejecutar un script del backend con tsx (cwd: backend). */
export const scriptBackend = path => ["--import", "tsx", path];

/** Argumentos del servidor de PDMC: API y frontend compilado en el mismo puerto. */
export const servidorPdmc = ["--import", "tsx", "src/server.ts", "--frontend"];
