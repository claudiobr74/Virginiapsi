import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthUser, openSession } from "./support/db";

describe("WhatsApp processor RPC ACL", () => {
  it("authenticated não executa RPCs internas de processamento", async () => {
    const userId = await createAuthUser();
    const session = await openSession({ userId });
    const id = randomUUID();

    try {
      for (const [sql, params] of [
        ["select public.mark_whatsapp_outbox_sending($1)", [id]],
        ["select public.mark_whatsapp_outbox_sent($1, $2)", [id, "SMTEST"]],
        ["select public.mark_whatsapp_outbox_failed($1, true, $2)", [id, "429"]],
        ["select public.invoke_whatsapp_reminder_job()", []],
      ] as const) {
        const error = await session.expectError(sql, [...params]);
        expect(error).toMatch(/permission denied|not authorized/i);
      }
    } finally {
      await session.close();
    }
  });
});
