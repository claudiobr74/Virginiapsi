import { describe, expect, it } from "vitest";
import {
  isValidTwilioSignature,
  twilioSignature,
} from "@/lib/integrations/twilio/signature";

describe("assinatura Twilio", () => {
  const url = "https://app.tesseli.test/api/webhooks/twilio/status";
  const params = { MessageSid: "SM123", MessageStatus: "delivered" };
  const token = "auth-token-secret";

  it("aceita a assinatura HMAC-SHA1 oficial", () => {
    const signature = twilioSignature(url, params, token);
    expect(isValidTwilioSignature(url, params, token, signature)).toBe(true);
  });

  it("rejeita assinatura inválida, ausente ou de outro payload", () => {
    const signature = twilioSignature(url, params, token);
    expect(isValidTwilioSignature(url, params, token, null)).toBe(false);
    expect(isValidTwilioSignature(url, params, token, "aaaa")).toBe(false);
    expect(isValidTwilioSignature(url, { ...params, MessageStatus: "sent" }, token, signature)).toBe(
      false,
    );
    expect(isValidTwilioSignature(`${url}/other`, params, token, signature)).toBe(false);
  });
});
