import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/integrations/google/oauth";

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Google Meet session safety invariants", () => {
  it("solicita os escopos necessários para criar a sala e configurar transcrição automática", () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      "https://www.googleapis.com/auth/meetings.space.created",
    );
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      "https://www.googleapis.com/auth/meetings.space.settings",
    );
  });

  it("não abandona a transcrição por timeout arbitrário nem escolhe apenas o primeiro conferenceRecord", () => {
    const contents = source("src/features/sessions/session-meet-actions.ts");

    expect(contents).not.toContain("TRANSCRIPT_ARTIFACT_TIMEOUT_MS");
    expect(contents).not.toContain("records[0]");
    expect(contents).toContain("for (const conference of records)");
    expect(contents).toContain("conferenceHasEntries");
    expect(contents).toContain("shouldKeepWatching");
  });

  it("mantém criação do Meet alinhada à RLS clínica e bloqueia sessão encerrada no servidor", () => {
    const contents = source("src/features/sessions/session-meet-actions.ts");

    expect(contents).toContain("isPsychologistAdmin(role)");
    expect(contents).toContain('session.status === "finalized"');
    expect(contents).toContain('session.status === "canceled"');
  });

  it("explica que a reconciliação continua com a sessão aberta e recomeça ao reabrir", () => {
    const contents = source(
      "src/features/sessions/components/session-meet-transcript.tsx",
    );

    expect(contents).toContain("Enquanto esta sessão estiver aberta");
    expect(contents).toContain("Ao reabrir a sessão");
  });
});
