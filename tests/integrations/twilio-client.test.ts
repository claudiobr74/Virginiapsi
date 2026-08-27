import { describe, expect, it } from "vitest";
import { TwilioApiError, TwilioMessagingClient } from "@/lib/integrations/twilio/client";
import { mockFetch } from "./support/mock-fetch";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("TwilioMessagingClient", () => {
  it("envia com Idempotency-Key, Basic auth e From", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ sid: "SM1", status: "queued" }));
    const client = new TwilioMessagingClient({ fetchImpl });

    const result = await client.send({
      accountSid: "ACabc",
      authToken: "token",
      to: "whatsapp:+5511999999999",
      body: "Olá",
      from: "whatsapp:+14155238886",
      statusCallback: "https://app.test/api/webhooks/twilio/status",
      idempotencyKey: "outbox:1",
    });

    expect(result).toEqual({ sid: "SM1", status: "queued" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACabc/Messages.json");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("outbox:1");
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("To")).toBe("whatsapp:+5511999999999");
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("StatusCallback")).toContain("/api/webhooks/twilio/status");
    expect(body.get("Body")).toBe("Olá");
  });

  it("envia ContentSid e ContentVariables no lugar de Body", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ sid: "SM3", status: "queued" }));
    const client = new TwilioMessagingClient({ fetchImpl });
    await client.send({
      accountSid: "ACabc",
      authToken: "token",
      to: "whatsapp:+5511999999999",
      body: "Olá",
      from: "+14155238886",
      contentSid: "HXabc",
      contentVariables: { patient_name: "Ana", starts_at: "terça" },
      idempotencyKey: "k",
    });
    const body = new URLSearchParams(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.get("ContentSid")).toBe("HXabc");
    expect(body.get("ContentVariables")).toBe(
      JSON.stringify({ patient_name: "Ana", starts_at: "terça" }),
    );
    expect(body.get("Body")).toBeNull();
    expect(body.get("From")).toBe("whatsapp:+14155238886");
  });

  it("usa MessagingServiceSid quando From não é informado", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ sid: "SM2", status: "queued" }));
    const client = new TwilioMessagingClient({ fetchImpl });
    await client.send({
      accountSid: "ACabc",
      authToken: "token",
      to: "whatsapp:+5511999999999",
      body: "Oi",
      messagingServiceSid: "MG123",
      idempotencyKey: "k",
    });
    const body = new URLSearchParams(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.get("MessagingServiceSid")).toBe("MG123");
    expect(body.get("From")).toBeNull();
  });

  it("marca 429/5xx como retryable", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ code: 20429, message: "rate" }, 429));
    const client = new TwilioMessagingClient({ fetchImpl });
    try {
      await client.send({
        accountSid: "ACabc",
        authToken: "token",
        to: "whatsapp:+5511999999999",
        body: "Oi",
        from: "whatsapp:+14155238886",
        idempotencyKey: "k",
      });
      expect.fail("expected TwilioApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(TwilioApiError);
      expect((error as TwilioApiError).retryable).toBe(true);
      expect((error as TwilioApiError).status).toBe(429);
    }
  });
});
