import { describe, expect, it } from "vitest";
import {
  googleOAuthReturnPath,
  parseGoogleOAuthReturnOrigin,
  parseGoogleOAuthReturnTo,
} from "@/features/calendar/oauth-callback";
import { signOAuthState, verifyOAuthState } from "@/lib/integrations/google/oauth";

const CANONICAL = "https://serena-psi-beta.vercel.app";
const SECRET = "state-signing-secret";

describe("Google Calendar OAuth — retorno à sessão autenticada", () => {
  it("preserva no state assinado o Preview que iniciou a conexão", () => {
    const payload = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      nonce: "nonce-preview",
      issuedAt: 1_800_000_000_000,
      returnTo: "settings" as const,
      returnOrigin: "https://virginiapsi-git-meet-preview.vercel.app",
    };

    const state = signOAuthState(payload, SECRET);
    const verified = verifyOAuthState(state, SECRET, payload.issuedAt + 1_000);

    expect(verified.valid).toBe(true);
    expect(verified.payload?.returnOrigin).toBe(payload.returnOrigin);
    expect(verified.payload?.returnTo).toBe("settings");
  });

  it("aceita Preview Vercel assinado e rejeita origem externa", () => {
    expect(
      parseGoogleOAuthReturnOrigin(
        "https://virginiapsi-git-meet-preview.vercel.app",
        CANONICAL,
      ),
    ).toBe("https://virginiapsi-git-meet-preview.vercel.app");

    expect(
      parseGoogleOAuthReturnOrigin("https://example.org", CANONICAL),
    ).toBe(CANONICAL);
  });

  it("retorna a Configurações > Integrações quando o fluxo começou ali", () => {
    expect(parseGoogleOAuthReturnTo("settings")).toBe("settings");
    expect(googleOAuthReturnPath("settings", "connected")).toBe(
      "/app/settings?tab=integrations&google=connected",
    );
  });
});
