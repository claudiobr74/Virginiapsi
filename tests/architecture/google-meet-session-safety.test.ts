import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/integrations/google/oauth";

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Google Meet session safety invariants", () => {
  it("mantém os escopos Meet opcionais para compatibilidade com integrações Workspace antigas", () => {
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

  it("cria a sala da sessão via Calendar, preserva RLS e bloqueia sessão encerrada", () => {
    const contents = source("src/features/sessions/session-meet-actions.ts");

    expect(contents).toContain("isPsychologistAdmin(role)");
    expect(contents).toContain('session.status === "finalized"');
    expect(contents).toContain('session.status === "canceled"');
    expect(contents).toContain("requestMeetForEvent");
    expect(contents).toContain("google_calendar_id");
    expect(contents).toContain("google_event_id");
    expect(contents).not.toContain("hasGoogleMeetSpaceScopes(connection.scopes)");
  });

  it("mantém evento técnico sem identificação do paciente para sessões sem evento gerenciado", () => {
    const contents = source("src/features/sessions/session-meet-actions.ts");

    expect(contents).toContain('summary: "Sessão VirgíniaPsi"');
    expect(contents).not.toContain("patient.name");
    expect(contents).not.toContain("patientDisplayLabel");
  });

  it("preserva o refresh token quando o Google não o rotaciona", () => {
    const contents = source("src/lib/integrations/google/connection.ts");

    expect(contents).toContain("refreshed.refresh_token ?? refreshToken");
    expect(contents).not.toContain("null as unknown as string");
  });

  it("explica que a reconciliação continua com a sessão aberta e recomeça ao reabrir", () => {
    const contents = source(
      "src/features/sessions/components/session-meet-transcript.tsx",
    );

    expect(contents).toContain("Enquanto esta sessão estiver aberta");
    expect(contents).toContain("Ao reabrir a sessão");
  });
});
