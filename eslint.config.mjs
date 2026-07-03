import { readFileSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import { createGdsConfig, resolveAllowedImports } from "@sovereignsquad/gds-eslint-config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const gdsManifest = JSON.parse(readFileSync(new URL("./gds-adoption.json", import.meta.url), "utf8"));
const gdsAllowedImports = [
  ...resolveAllowedImports(gdsManifest),
  "@/components/ui/AppButton",
];
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
    // React-Compiler-era advisory rules (emitted since the eslint-config-next /
    // gds-eslint-config 3.9 upgrade). Every current hit is an intentional pattern in
    // interactive components — sync URL/prop → state, copy-prop-to-state for optimistic
    // updates, async param/data init. Off rather than risk-refactoring production
    // capture/slideshow/admin hot paths for style; revisit with a React Compiler adoption.
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
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
