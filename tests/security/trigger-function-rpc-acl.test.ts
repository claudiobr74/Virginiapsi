import { describe, expect, it } from "vitest";
import { runAsAdmin } from "./support/db";

describe("SECURITY DEFINER trigger RPC ACL", () => {
  it("does not expose trigger functions to anon or authenticated", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        function_name: string;
        anon_exec: boolean;
        authenticated_exec: boolean;
      }>(`
        select
          p.oid::regprocedure::text as function_name,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and exists (
            select 1
            from pg_trigger t
            where t.tgfoid = p.oid
              and not t.tgisinternal
          )
          and (
            has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          )
        order by 1;
      `);
      return result.rows;
    });

    expect(rows).toEqual([]);
  });
});
