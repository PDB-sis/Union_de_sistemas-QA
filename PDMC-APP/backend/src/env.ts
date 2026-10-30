import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Variables de entorno del backend. Las del sistema siempre tienen prioridad; después
// .env.local y luego .env. Se buscan en backend/ y, por compatibilidad con instalaciones
// anteriores a la separación, en PDMC-APP/. No se imprime ningún valor.
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const dir of [backendDir, resolve(backendDir, "..")]) {
    for (const name of [".env.local", ".env"]) {
      const file = resolve(dir, name);
      if (!existsSync(file)) continue;
      for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
  }
}
