"use server";

import { revalidatePath } from "next/cache";
import { getFinanceAccess } from "@/features/finance/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function reopenPeriodWithReasonAction(
  closingId: string,
  reason: string,
): Promise<{ id?: string; error?: string }> {
  const ctx = await requireOrgContext();
  const access = await getFinanceAccess(ctx.organizationId, ctx.role);
  if (access !== "manage") {
    return { error: "Sem permissão para alterar o financeiro." };
  }

  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { error: "Informe o motivo da reabertura." };
  }
  if (trimmed.length > 300) {
    return { error: "Motivo da reabertura muito longo." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_closings")
    .update({
      status: "open",
      reopened_at: new Date().toISOString(),
      reopen_reason: trimmed,
    })
    .eq("id", closingId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "closed")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível reabrir o período." };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.closing.reopen",
    resourceType: "financial_closing",
    resourceId: data.id,
    metadata: { reason: trimmed },
  });
  revalidatePath("/app/finance");
  revalidatePath("/app");
  return { id: data.id };
}
