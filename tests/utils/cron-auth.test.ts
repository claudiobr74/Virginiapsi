import { describe, expect, it } from "vitest";
import { isValidCronRequest, secretsMatch } from "@/lib/integrations/twilio/cron-auth";

describe("CRON_SECRET", () => {
  it("aceita o segredo correto em x-cron-secret ou Bearer", () => {
    const secret = "cron-secret-value";
    expect(
      isValidCronRequest(
        new Request("http://localhost/api/jobs/whatsapp-reminders", {
          headers: { "x-cron-secret": secret },
        }),
        secret,
      ),
    ).toBe(true);
    expect(
      isValidCronRequest(
        new Request("http://localhost/api/jobs/whatsapp-reminders", {
          headers: { Authorization: `Bearer ${secret}` },
        }),
        secret,
      ),
    ).toBe(true);
  });

  it("rejeita segredo inválido, ausente ou de tamanho diferente", () => {
    const secret = "cron-secret-value";
    expect(secretsMatch(null, secret)).toBe(false);
    expect(secretsMatch("nope", secret)).toBe(false);
    expect(secretsMatch("short", secret)).toBe(false);
    expect(
      isValidCronRequest(new Request("http://localhost/api/jobs/whatsapp-reminders"), secret),
    ).toBe(false);
  });
});
