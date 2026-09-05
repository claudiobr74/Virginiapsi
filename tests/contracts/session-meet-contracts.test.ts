import { describe, expect, it } from "vitest";
import { sessionMeetBindingRowSchema } from "@/features/sessions/session-meet-contracts";

describe("session Meet binding schema", () => {
  it("keeps session rendering compatible before Calendar binding columns arrive", () => {
    const parsed = sessionMeetBindingRowSchema.parse({
      session_id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      status: "ready",
      meet_space_name: "spaces/example",
      meeting_code: "abc-defg-hij",
      meet_url: "https://meet.google.com/abc-defg-hij",
      auto_transcription_enabled: false,
      conference_record_id: null,
      transcript_id: null,
      transcript_status: "unavailable",
      last_error: null,
      created_at: "2026-09-04T12:00:00.000Z",
      updated_at: "2026-09-04T12:00:00.000Z",
    });

    expect(parsed.google_calendar_id).toBeNull();
    expect(parsed.google_event_id).toBeNull();
    expect(parsed.meet_url).toBe("https://meet.google.com/abc-defg-hij");
  });
});
