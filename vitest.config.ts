import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // E2E runs under Playwright; the security suite needs a real PostgreSQL
    // and its own config (`pnpm test:security`), so the unit run stays
    // database-free.
    exclude: ["tests/e2e/**", "tests/security/**"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_placeholder",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
