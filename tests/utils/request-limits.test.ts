import { describe, expect, it } from "vitest";
import {
  BODY_LIMIT_BYTES,
  contentLengthExceeds,
  readLimitedJson,
  readLimitedText,
  utf8ByteLength,
} from "@/lib/security/request-limits";

describe("limites de payload", () => {
  it("aceita texto abaixo do teto", async () => {
    await expect(
      readLimitedText(
        new Request("http://localhost/api", { method: "POST", body: "From=+5511" }),
        BODY_LIMIT_BYTES.twilioWebhook,
      ),
    ).resolves.toEqual({ ok: true, text: "From=+5511" });
  });

  it("rejeita Content-Length acima do teto sem precisar ler o corpo", () => {
    expect(
      contentLengthExceeds(
        new Headers({ "content-length": String(BODY_LIMIT_BYTES.twilioWebhook + 1) }),
        BODY_LIMIT_BYTES.twilioWebhook,
      ),
    ).toBe(true);
  });

  it("rejeita corpo UTF-8 acima do teto mesmo sem Content-Length", async () => {
    const oversized = "á".repeat(BODY_LIMIT_BYTES.jsonTranscribeMetadata);
    expect(utf8ByteLength(oversized)).toBeGreaterThan(BODY_LIMIT_BYTES.jsonTranscribeMetadata);

    const request = new Request("http://localhost/api", {
      method: "POST",
      body: oversized,
    });

    await expect(
      readLimitedJson(request, BODY_LIMIT_BYTES.jsonTranscribeMetadata),
    ).resolves.toEqual({ ok: false, status: 413 });
  });

  it("aceita JSON válido abaixo do teto e recusa JSON inválido", async () => {
    const ok = await readLimitedJson(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ patientId: "ok" }),
      }),
      BODY_LIMIT_BYTES.jsonCapture,
    );
    expect(ok).toEqual({ ok: true, value: { patientId: "ok" } });

    const invalid = await readLimitedJson(
      new Request("http://localhost/api", {
        method: "POST",
        body: "{",
      }),
      BODY_LIMIT_BYTES.jsonCapture,
    );
    expect(invalid).toEqual({ ok: false, status: 400 });
  });

  it("trata Content-Length inválido como excesso (fail-closed)", () => {
    expect(contentLengthExceeds(new Headers({ "content-length": "nope" }), 32)).toBe(true);
    expect(contentLengthExceeds(new Headers({ "content-length": "-1" }), 32)).toBe(true);
    expect(contentLengthExceeds(new Headers({ "content-length": "16" }), 32)).toBe(false);
  });
});
