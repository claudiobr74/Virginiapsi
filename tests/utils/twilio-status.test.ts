import { describe, expect, it } from "vitest";
import { shouldApplyTwilioStatus } from "@/lib/integrations/twilio/status";

describe("transições de status Twilio", () => {
  it("avança queued → sent → delivered e ignora regressão", () => {
    expect(shouldApplyTwilioStatus("queued", "sent")).toBe(true);
    expect(shouldApplyTwilioStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyTwilioStatus("delivered", "sent")).toBe(false);
    expect(shouldApplyTwilioStatus("delivered", "delivered")).toBe(false);
    expect(shouldApplyTwilioStatus("read", "queued")).toBe(false);
  });

  it("aceita failed/undelivered só antes de delivered", () => {
    expect(shouldApplyTwilioStatus("sent", "failed")).toBe(true);
    expect(shouldApplyTwilioStatus("delivered", "failed")).toBe(false);
    expect(shouldApplyTwilioStatus("read", "undelivered")).toBe(false);
  });
});
