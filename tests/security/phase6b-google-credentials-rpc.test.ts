import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905215800_phase6b_google_credentials_server_only.sql",
  ),
  "utf8",
);
const connection = readFileSync(
  resolve(process.cwd(), "src/lib/integrations/google/connection.ts"),
  "utf8",
);

describe("phase6B Google credential RPC hardening", () => {
  it("removes signed-in execution and preserves service-role execution", () => {
    expect(migration).toContain(
      "revoke execute on function public.get_google_credentials(uuid) from authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.get_google_credentials(uuid) to service_role;",
    );
    expect(migration).toContain("(select auth.role()) = 'service_role'");
  });

  it("keeps encrypted credential reads on the server-only admin client", () => {
    expect(connection).toContain('import "server-only";');
    expect(connection).toContain(
      'import { createSupabaseAdminClient } from "@/lib/supabase/admin";',
    );
    expect(connection).toMatch(
      /const supabase = createSupabaseAdminClient\(\);[\s\S]*?\.rpc\("get_google_credentials"/,
    );
  });

  it("does not move credential writes to service-role in this batch", () => {
    expect(connection).toMatch(
      /async function persistCredentials[\s\S]*?createSupabaseServerClient\(\)[\s\S]*?\.rpc\("upsert_google_credentials"/,
    );
    expect(migration).not.toContain("upsert_google_credentials");
  });
});
