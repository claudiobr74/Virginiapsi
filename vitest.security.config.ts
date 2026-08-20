import path from "node:path";
import { defineConfig } from "vitest/config";

// Security/RLS suite: runs against a real PostgreSQL instance with the
// Supabase auth surface emulated (tests/security/support/supabase-emulation.sql).
// Kept separate from `pnpm test` so unit tests stay database-free.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
    globalSetup: ["./tests/security/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
