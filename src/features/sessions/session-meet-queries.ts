import "server-only";

import {
  sessionMeetBindingRowSchema,
  sessionMeetTranscriptEntryRowSchema,
  type SessionMeetBindingRow,
  type SessionMeetTranscriptEntryRow,
} from "@/features/sessions/session-meet-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSessionMeetBinding(
  organizationId: string,
  sessionId: string,
): Promise<SessionMeetBindingRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_meet_bindings")
    .select("*")
    .eq("session_id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load session Meet binding: ${error.message}`);
  }

  return data ? sessionMeetBindingRowSchema.parse(data) : null;
}

export async function listSessionMeetTranscriptEntries(
  organizationId: string,
  sessionId: string,
): Promise<SessionMeetTranscriptEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_meet_transcript_entries")
    .select("*")
    .eq("session_id", sessionId)
    .eq("organization_id", organizationId)
    .order("start_time", { ascending: true })
    .order("google_entry_name", { ascending: true });

  if (error) {
    throw new Error(`failed to load session Meet transcript: ${error.message}`);
  }

  return (data ?? []).map((row) => sessionMeetTranscriptEntryRowSchema.parse(row));
}
