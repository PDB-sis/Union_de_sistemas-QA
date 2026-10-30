import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["generated/**", "backups/**"]),
  {
    files: ["**/*.{ts,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    // Reglas que la configuración anterior (Next.js) no aplicaba y que marcan patrones intencionales:
    // catch vacíos a propósito y expresiones regulares que limpian caracteres de control en los CSV.
    rules: { "no-empty": ["error", { allowEmptyCatch: true }], "no-control-regex": "off", "no-useless-escape": "off" },
    languageOptions: { globals: globals.node },
  },
]);
