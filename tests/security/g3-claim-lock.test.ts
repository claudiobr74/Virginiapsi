import { describe, expect, it } from "vitest";
import {
  createAuthUser,
  ensurePlatformOperator,
  openSession,
  runAsAdmin,
} from "./support/db";

describe("G3a — claim_platform_operator com lock", () => {
  it("a função serializa o claim com advisory lock", async () => {
    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{ prosrc: string }>(
        `select p.prosrc
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'claim_platform_operator'`,
      );
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].prosrc).toMatch(/pg_advisory_xact_lock/);
    expect(rows[0].prosrc).toMatch(/platform_operators\.claim/);
  });

  it("dois claims concorrentes na mesa vazia deixam um único operador", async () => {
    const first = await createAuthUser("g3-claim-a@tesseli.test");
    const second = await createAuthUser("g3-claim-b@tesseli.test");

    await runAsAdmin(async (client) => {
      await client.query("delete from public.platform_operators");
    });

    const sessionA = await openSession({ userId: first });
    const sessionB = await openSession({ userId: second });
    try {
      const [a, b] = await Promise.all([
        sessionA.query<{ claim_platform_operator: boolean }>(
          "select public.claim_platform_operator() as claim_platform_operator",
        ),
        sessionB.query<{ claim_platform_operator: boolean }>(
          "select public.claim_platform_operator() as claim_platform_operator",
        ),
      ]);

      const winners = [a[0].claim_platform_operator, b[0].claim_platform_operator].filter(
        Boolean,
      );
      expect(winners).toHaveLength(1);

      const remaining = await runAsAdmin(async (client) => {
        const result = await client.query<{ user_id: string }>(
          "select user_id from public.platform_operators",
        );
        return result.rows.map((row) => row.user_id);
      });
      expect(remaining).toHaveLength(1);
      expect([first, second]).toContain(remaining[0]);
    } finally {
      await sessionA.close();
      await sessionB.close();
      await ensurePlatformOperator(first);
    }
  });
});
