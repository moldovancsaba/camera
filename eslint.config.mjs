import { readFileSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import { createGdsConfig, resolveAllowedImports } from "@doneisbetter/gds-eslint-config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const gdsManifest = JSON.parse(readFileSync(new URL("./gds-adoption.json", import.meta.url), "utf8"));
const gdsAllowedImports = [...resolveAllowedImports(gdsManifest)];
const scopedGdsConfig = createGdsConfig({ allowedImports: gdsAllowedImports }).map((entry) => ({
  ...entry,
  files: [
    "components/gds/**/*.{ts,tsx}",
    "lib/gds/**/*.{ts,tsx}",
    "app/layout.tsx",
    "app/providers.tsx",
  ],
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  ...scopedGdsConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
