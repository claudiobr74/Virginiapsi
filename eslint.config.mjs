import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    // Spikes são investigações isoladas, com dependências próprias e fora do
    // bundle do app. Ver spikes/*/README.
    "spikes/**",
  ]),
]);

export default eslintConfig;
