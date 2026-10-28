import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const envPath = resolve(root, ".env.local");
const passwordPath = resolve(root, ".secrets/postgres-password");
const original = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const configured = original.match(/^[ \t]*DATABASE_URL[ \t]*=[ \t]*([^\r\n]*)/m)?.[1]?.trim();
if (configured && configured !== '""' && configured !== "''") {
  console.info("DATABASE_URL ya está configurada; no se cambió la conexión ni la contraseña.");
} else {
  mkdirSync(resolve(root, ".secrets"), { recursive: true });
  const password = existsSync(passwordPath) ? readFileSync(passwordPath, "utf8").trim() : randomBytes(32).toString("base64url");
  if (!password) throw new Error("El archivo de contraseña está vacío; no se modificó el entorno.");
  if (!existsSync(passwordPath)) writeFileSync(passwordPath, password, { flag: "wx", mode: 0o600 });
  if (existsSync(envPath)) {
    mkdirSync(resolve(root, "backups"), { recursive: true });
    copyFileSync(envPath, resolve(root, `backups/env-local-${Date.now()}.bak`));
  }
  const line = `DATABASE_URL="postgresql://pdmc_owner:${encodeURIComponent(password)}@127.0.0.1:55432/pdmc?schema=public"`;
  const updated = /^\s*DATABASE_URL\s*=/m.test(original)
    ? original.replace(/^[ \t]*DATABASE_URL[ \t]*=.*$/m, line)
    : `${original}${original.endsWith("\n") || !original ? "" : "\n"}${line}\n`;
  writeFileSync(envPath, updated, { mode: 0o600 });
  console.info("Conexión local preparada; configuración anterior respaldada si existía. No se muestran secretos.");
}
