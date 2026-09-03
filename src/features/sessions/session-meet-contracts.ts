import { z } from "zod";

export const SESSION_MEET_STATUS_VALUES = ["creating", "ready", "failed"] as const;
export type SessionMeetStatus = (typeof SESSION_MEET_STATUS_VALUES)[number];

export const SESSION_MEET_TRANSCRIPT_STATUS_VALUES = [
  "not_started",
  "awaiting_artifact",
  "imported",
  "unavailable",
  "failed",
] as const;
export type SessionMeetTranscriptStatus =
  (typeof SESSION_MEET_TRANSCRIPT_STATUS_VALUES)[number];

export const sessionMeetBindingRowSchema = z.object({
  session_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  status: z.enum(SESSION_MEET_STATUS_VALUES),
  meet_space_name: z.string().nullable(),
  meeting_code: z.string().nullable(),
  meet_url: z.string().url().nullable(),
  auto_transcription_enabled: z.boolean(),
  conference_record_id: z.string().nullable(),
  transcript_id: z.string().nullable(),
  transcript_status: z.enum(SESSION_MEET_TRANSCRIPT_STATUS_VALUES),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SessionMeetBindingRow = z.infer<typeof sessionMeetBindingRowSchema>;

export interface SessionMeetActionResult {
  error?: string;
  meetUrl?: string;
  status?: SessionMeetStatus;
  autoTranscriptionEnabled?: boolean;
}
