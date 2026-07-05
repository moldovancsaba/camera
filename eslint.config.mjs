import { readFileSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import { createGdsConfig, resolveAllowedImports } from "@sovereignsquad/gds-eslint-config";
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

// RSC boundary guard (GitHub #82): in a Server Component (no 'use client'
// directive), a function-valued `component` prop cannot be serialized across
// the server→client boundary — Mantine/GDS polymorphic targets are all client
// components, so this crashes production renders with "Functions cannot be
// passed directly to Client Components" (see the v2.14.0 digest-4053814135
// incident). Use component="a" (a string) in Server Components instead.
const rscBoundaryPlugin = {
  rules: {
    "no-component-fn-prop-in-server-files": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow function-valued `component` props in files without a 'use client' directive",
        },
        messages: {
          fnComponentProp:
            "Server Component passes a function as `component` — RSC cannot serialize it and the render crashes in production. Use component=\"a\" or move this JSX into a 'use client' file.",
        },
        schema: [],
      },
      create(context) {
        const source = context.sourceCode.getText();
        const isClientFile = /^\s*['"]use client['"]/m.test(source.slice(0, 500));
        if (isClientFile) {
          return {};
        }
        return {
          JSXAttribute(node) {
            if (node.name?.name !== "component") return;
            const value = node.value;
            if (!value || value.type !== "JSXExpressionContainer") return;
            const expression = value.expression;
            if (expression.type === "Literal") return;
            context.report({ node, messageId: "fnComponentProp" });
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.tsx"],
    plugins: { "camera-rsc": rscBoundaryPlugin },
    rules: {
      "camera-rsc/no-component-fn-prop-in-server-files": "error",
    },
  },
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
