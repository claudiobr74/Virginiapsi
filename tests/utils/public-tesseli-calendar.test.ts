import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const PUBLIC_CALENDAR_FILES = [
  "src/features/calendar/components/connection-panel.tsx",
  "src/features/calendar/oauth-callback.ts",
  "src/features/calendar/components/google-oauth-result-banner.tsx",
  "src/lib/integrations/google/oauth.ts",
  "src/app/api/integrations/google/start/route.ts",
  "src/app/api/integrations/google/callback/route.ts",
  "src/app/api/integrations/google/connect/route.ts",
  "src/lib/integrations/google/pull-filter.ts",
  "src/lib/integrations/google/event-window.ts",
];

describe("referências Tesseli no fluxo público da Agenda", () => {
  it("não usa Tesseli em copy de OAuth/Calendar visível ou no client OAuth", () => {
    for (const relative of PUBLIC_CALENDAR_FILES) {
      const source = readFileSync(path.join(ROOT, relative), "utf8");
      expect(source, relative).not.toMatch(/Tesseli|tesseli/);
    }
  });
});
