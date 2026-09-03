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

export const sessionMeetTranscriptEntryRowSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  conference_record_name: z.string(),
  transcript_name: z.string(),
  google_entry_name: z.string(),
  participant_resource: z.string().nullable(),
  text: z.string(),
  language_code: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  created_at: z.string(),
});

export type SessionMeetTranscriptEntryRow = z.infer<
  typeof sessionMeetTranscriptEntryRowSchema
>;

export interface SessionMeetActionResult {
  error?: string;
  meetUrl?: string;
  status?: SessionMeetStatus;
  autoTranscriptionEnabled?: boolean;
}

export interface SessionMeetTranscriptSyncResult {
  status: SessionMeetTranscriptStatus;
  importedCount?: number;
  nextPollMs?: number;
  error?: string;
}
