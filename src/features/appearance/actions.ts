"use server";

import { revalidatePath } from "next/cache";
import {
  APPEARANCE_PRESETS,
  type AppearancePreset,
} from "@/features/appearance/appearance-presets";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateAppearancePresetAction(input: {
  preset: AppearancePreset;
}): Promise<{ error?: string; preset?: AppearancePreset }> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora altera a aparência." };
  }
  if (!(APPEARANCE_PRESETS as readonly string[]).includes(input.preset)) {
    return { error: "Estilo visual inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("practice_settings")
    .update({ appearance_preset: input.preset } as never)
    .eq("organization_id", ctx.organizationId);

  if (error) {
    return { error: "Não foi possível salvar o estilo visual." };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.appearance_preset.update",
    resourceType: "practice_settings",
    resourceId: ctx.organizationId,
    metadata: { preset: input.preset },
  });

  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { preset: input.preset };
}
