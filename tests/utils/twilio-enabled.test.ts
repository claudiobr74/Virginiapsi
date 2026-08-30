import { describe, expect, it } from "vitest";
import { isTwilioEnabled, isTwilioOperational } from "@/lib/integrations/twilio/enabled";

describe("flag Twilio", () => {
  it("permanece desligada por padrão", () => {
    expect(isTwilioEnabled({})).toBe(false);
    expect(
      isTwilioOperational({
        TWILIO_ACCOUNT_SID: "AC00",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_WHATSAPP_FROM: "whatsapp:+5500000000000",
      }),
    ).toBe(false);
  });

  it("só opera com flag, credenciais e remetente", () => {
    expect(
      isTwilioOperational({
        TWILIO_ENABLED: true,
        TWILIO_ACCOUNT_SID: "AC00",
        TWILIO_AUTH_TOKEN: "token",
      }),
    ).toBe(false);
    expect(
      isTwilioOperational({
        TWILIO_ENABLED: true,
        TWILIO_ACCOUNT_SID: "AC00",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_MESSAGING_SERVICE_SID: "MG00",
      }),
    ).toBe(true);
  });
});
