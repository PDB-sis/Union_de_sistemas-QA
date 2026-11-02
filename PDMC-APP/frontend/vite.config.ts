import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { paletteBootScript } from "./src/lib/palette";

// La paleta elegida se aplica antes de pintar (mismo script que usaba el layout de Next).
const paletaAntesDePintar = (): Plugin => ({
  name: "pdmc-paleta",
  transformIndexHtml: html => html.replace("<!--paleta-->", `<script>${paletteBootScript}</script>`),
});

export default defineConfig(({ mode }) => {
  // En desarrollo /api se reenvía al backend local (npm run dev -w backend) o, con
  // PDMC_API_URL=https://..., a una API publicada para probar la interfaz con datos reales.
  const env = loadEnv(mode, process.cwd(), "PDMC_");
  const target = env.PDMC_API_URL ?? "http://127.0.0.1:3000";
  // Una API remota solo acepta su propio origen HTTPS (CSRF) y Caddy enruta por Host: el proxy
  // local se presenta con ese origen. Se puede cambiar con PDMC_API_ORIGEN si la API usa otro.
  const remoto = new URL(target).protocol === "https:";
  const origen = env.PDMC_API_ORIGEN ?? new URL(target).origin;
  return {
    plugins: [react(), tailwindcss(), paletaAntesDePintar()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target,
          changeOrigin: remoto,
          configure: proxy => {
            if (remoto) proxy.on("proxyReq", req => { if (req.getHeader("origin")) req.setHeader("origin", origen); });
          },
        },
      },
    },
    build: { outDir: "dist", sourcemap: false },
  };
});
