import { type NextRequest } from "next/server";
import { completeAuthCallback } from "@/features/auth/oauth-callback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return completeAuthCallback(request, {
    async exchange({ code, flowId }) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (!error) {
        return { error: null };
      }
      return {
        error: {
          name: error.name,
          code: typeof error.code === "string" ? error.code : undefined,
          status: error.status,
        },
      };
    },
    async acceptInvitations() {
      const supabase = await createSupabaseServerClient();
      await supabase.rpc("accept_pending_invitations");
    },
  });
}
