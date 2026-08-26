import { describe, expect, it } from "vitest";
import { normalizeE164, toWhatsAppAddress } from "@/lib/integrations/twilio/e164";

describe("normalizeE164", () => {
  it("adiciona +55 a números brasileiros locais", () => {
    expect(normalizeE164("11988887777")).toBe("+5511988887777");
    expect(normalizeE164("(11) 98888-7777")).toBe("+5511988887777");
  });

  it("preserva E.164 já internacional", () => {
    expect(normalizeE164("+5511988887777")).toBe("+5511988887777");
    expect(normalizeE164("5511988887777")).toBe("+5511988887777");
  });

  it("rejeita entrada insuficiente", () => {
    expect(normalizeE164("123")).toBeNull();
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164("")).toBeNull();
  });

  it("formata endereço WhatsApp", () => {
    expect(toWhatsAppAddress("+5511988887777")).toBe("whatsapp:+5511988887777");
    expect(toWhatsAppAddress("whatsapp:+5511988887777")).toBe("whatsapp:+5511988887777");
  });
});
