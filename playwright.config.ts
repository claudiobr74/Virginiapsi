import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const authStubPort = Number(process.env.AUTH_STUB_PORT ?? 54331);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const supabaseUrl = `http://127.0.0.1:${authStubPort}`;

const sharedEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_stub",
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  AUTH_STUB_PORT: String(authStubPort),
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // One in-memory auth stub is shared by every project. Mutable org settings
  // (e.g. secretary_finance_access) race if desktop and mobile write them at
  // the same time — serialise workers so those tests stay deterministic.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `node tests/e2e/support/auth-stub-server.mjs`,
      url: `${supabaseUrl}/health`,
      reuseExistingServer: false,
      env: sharedEnv,
      stdout: "pipe",
    },
    {
      command: process.env.CI ? "pnpm start" : "pnpm dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      env: { ...sharedEnv, PORT: String(port) },
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
});
