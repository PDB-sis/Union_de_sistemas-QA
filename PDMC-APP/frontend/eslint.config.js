import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist/**", "tests/capturas/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    // Reglas que la configuración anterior (Next.js) no aplicaba y que marcan patrones intencionales:
    // catch vacíos a propósito y expresiones regulares que limpian caracteres de control en los CSV.
    rules: { "no-empty": ["error", { allowEmptyCatch: true }], "no-control-regex": "off", "no-useless-escape": "off" },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["tests/**/*.mjs", "vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/hooks/use-mobile.ts"],
    rules: {
      // Copiados tal cual de shadcn@4.17.0: se conserva el original y las reglas estrictas aplican al resto.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
