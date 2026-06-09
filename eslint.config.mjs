import { defineConfig } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...coreWebVitals,
  ...nextTypescript,
  {
    // lib/graph is the pure layout engine: no DOM, no network, no framework.
    // This boundary is what keeps the phase-2 zero-native companion cheap
    // (see docs/ARCHITECTURE.md "Module boundaries to preserve").
    files: ["lib/graph/**/*.ts", "lib/graph/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "lib/graph must stay framework-free." },
            { group: ["next", "next/*"], message: "lib/graph must stay framework-free." },
            { group: ["node:*"], message: "lib/graph must stay runtime-agnostic (no node builtins)." },
            { group: ["@/app/*", "@/components/*"], message: "lib/graph must not depend on UI layers." },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "fetch", "navigator", "localStorage"],
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"],
  },
]);

export default eslintConfig;
