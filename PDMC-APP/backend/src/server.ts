import { loadEnv } from "./env";
loadEnv();

import { createServer as createHttpsServer } from "node:https";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import * as admin from "./http/admin/[...path]/route";
import * as auth from "./http/auth/[action]/route";
import * as devoluciones from "./http/devoluciones/route";
import * as devolucion from "./http/devoluciones/[numero]/route";
import * as observaciones from "./http/facturacion/observaciones/route";
import * as inconsistencias from "./http/inconsistencias/route";
import * as inventario from "./http/inventario/route";
import * as metricas from "./http/metricas/route";
import * as negativos from "./http/operacion/negativos/[...path]/route";
import * as panel from "./http/panel/route";
import * as qaSso from "./http/qa-sso/route";
import * as sincronizacion from "./http/sincronizacion/route";
import * as tienda from "./http/tienda/route";
import * as transferencia from "./http/transferencias/[numero]/route";
import * as transferenciasConsulta from "./http/transferencias/consulta/route";

// Servidor de la API de PDMC. Cada módulo de src/http exporta sus métodos (GET, POST, PATCH)
// con la firma estándar (Request, { params }) => Response, así que se montan sin cambios.
type Params = Record<string, string | string[]>;
type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response> | Response;
type Module = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

const app = new Hono();

// Mismas cabeceras de seguridad que tenía next.config.ts.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
});

function mount(path: string, module: Module, params: (c: Context) => Params = () => ({})) {
  for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
    const handler = module[method];
    if (handler) app.on(method, path, c => handler(c.req.raw, { params: Promise.resolve(params(c)) as Promise<never> }));
  }
}
/** Segmentos después de un prefijo (equivale a [...path] de Next.js). */
const rest = (prefix: string) => (c: Context) => ({ path: decodeURIComponent(new URL(c.req.url).pathname).slice(prefix.length).split("/").filter(Boolean) });

mount("/api/admin/*", admin, rest("/api/admin/"));
mount("/api/auth/:action", auth, c => ({ action: c.req.param("action")! }));
mount("/api/devoluciones", devoluciones);
mount("/api/devoluciones/:numero", devolucion, c => ({ numero: c.req.param("numero")! }));
mount("/api/facturacion/observaciones", observaciones);
mount("/api/inconsistencias", inconsistencias);
mount("/api/inventario", inventario);
mount("/api/metricas", metricas);
mount("/api/operacion/negativos/*", negativos, rest("/api/operacion/negativos/"));
mount("/api/panel", panel);
mount("/api/qa-sso", qaSso);
mount("/api/sincronizacion", sincronizacion);
mount("/api/tienda", tienda);
mount("/api/transferencias/consulta", transferenciasConsulta);
mount("/api/transferencias/:numero", transferencia, c => ({ numero: c.req.param("numero")! }));
app.all("/api/*", c => c.json({ ok: false, error: { code: "RUTA", message: "Operación no encontrada." } }, 404));

// Interfaz compilada (opcional): con PDMC_FRONTEND_DIST, o con --frontend (usa ../frontend/dist),
// el mismo puerto sirve el frontend; así la sesión y el origen son los mismos sin otro proxy.
// Sin ninguna de las dos, el proceso solo atiende /api y el frontend se publica aparte.
const dist = process.env.PDMC_FRONTEND_DIST ? resolve(process.env.PDMC_FRONTEND_DIST)
  : process.argv.includes("--frontend") ? resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/dist") : null;
if (dist) {
  if (!existsSync(resolve(dist, "index.html"))) throw new Error("PDMC_FRONTEND_DIST no contiene un build del frontend (falta index.html).");
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  };
  app.get("*", async c => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    let file = resolve(dist, "." + path);
    if (file !== dist && !file.startsWith(dist + sep)) return c.text("No encontrado", 404);
    // Rutas de la aplicación (/, /tienda, /login…) sin archivo: se entrega index.html.
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(path)) return c.text("No encontrado", 404);
      file = resolve(dist, "index.html");
    }
    const immutable = file.includes(`${sep}assets${sep}`);
    return c.body(await readFile(file), 200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
  });
}

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.PDMC_HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT inválido.");
// HTTPS directo para la red local (scripts/preparar-https.ps1). Detrás de Tailscale o Caddy no hace falta.
const pfx = process.env.PDMC_TLS_PFX_FILE;
const server = serve({
  fetch: app.fetch, port, hostname,
  ...(pfx ? {
    createServer: createHttpsServer,
    serverOptions: { pfx: readFileSync(pfx), passphrase: readFileSync(process.env.PDMC_TLS_PASSWORD_FILE ?? ".secrets/pdmc-lan-password").toString().trim(), minVersion: "TLSv1.2" as const },
  } : {}),
}, info => console.info(`PDMC API lista en ${pfx ? "https" : "http"}://${hostname}:${info.port}${dist ? " (con la interfaz)" : ""}`));
const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
