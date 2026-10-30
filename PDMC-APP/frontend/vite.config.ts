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
  // En desarrollo /api se reenvía al backend (npm run dev -w backend).
  const env = loadEnv(mode, process.cwd(), "PDMC_");
  return {
    plugins: [react(), tailwindcss(), paletaAntesDePintar()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: { "/api": { target: env.PDMC_API_URL ?? "http://127.0.0.1:3000", changeOrigin: false } },
    },
    build: { outDir: "dist", sourcemap: false },
  };
});
