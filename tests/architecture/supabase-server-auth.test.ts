import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPABASE_SERVER_AUTH_OPTIONS } from "@/lib/supabase/server-auth-options";

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Supabase server auth initialization", () => {
  it("mantém a inicialização automática desativada para evitar corrida no PKCE", () => {
    expect(SUPABASE_SERVER_AUTH_OPTIONS).toEqual({
      skipAutoInitialize: true,
    });
  });

  it.each(["src/lib/supabase/server.ts", "src/proxy.ts"])(
    "%s usa as opções canônicas de auth do servidor",
    (relativePath) => {
      const contents = source(relativePath);
      expect(contents).toContain("SUPABASE_SERVER_AUTH_OPTIONS");
      expect(contents).toContain("auth: SUPABASE_SERVER_AUTH_OPTIONS");
    },
  );

  it("usa cliente de login isolado e não altera o redirect com sb_flow_id", () => {
    const contents = source("src/lib/supabase/browser.ts");
    expect(contents).toContain("createSupabaseLoginBrowserClient");
    expect(contents).toContain("isSingleton: false");
    expect(contents).toContain("skipAutoInitialize: true");
    expect(contents).toContain("appendPkceFlowIdToRedirects: false");
  });
});
