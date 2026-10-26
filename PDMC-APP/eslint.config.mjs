import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "generated/**",
    "entregables/**",
  ]),
  {
    files: ["desktop/launcher.js"],
    rules: {
      // Este ejecutable usa CommonJS y __dirname, también al empaquetarse.
      // Permitir solo sus cuatro módulos nativos; mantener la regla activa.
      "@typescript-eslint/no-require-imports": ["error", {
        allow: ["^(?:node:)?(?:child_process|fs|http|path)$"],
      }],
    },
  },
  {
    files: ["frontend/components/ui/**/*.{ts,tsx}", "frontend/hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
