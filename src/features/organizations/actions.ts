"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/features/organizations/active-organization";
import {
  bootstrapOrganizationSchema,
  slugFromName,
} from "@/features/organizations/contracts";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
};

export async function bootstrapOrganizationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();

  const parsed = bootstrapOrganizationSchema.safeParse({
    name: formData.get("name"),
    professionalName: formData.get("professionalName"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("bootstrap_organization", {
    org_name: parsed.data.name,
    org_slug: slugFromName(parsed.data.name),
    professional_name: parsed.data.professionalName || null,
  });

  if (error || typeof data !== "string") {
    return {
      error:
        "Não foi possível criar o consultório agora. Tente novamente em instantes.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, data, COOKIE_OPTIONS);

  redirect("/app");
}

/**
 * Stores the navigation context for the active organization. The value is
 * validated against the memberships the database returns for this user, so it
 * can never be used to reach an organization the user does not belong to.
 */
export async function selectActiveOrganizationAction(
  organizationId: string,
): Promise<ActionState> {
  await requireUser();

  const memberships = await listActiveMemberships();
  const membership = memberships.find(
    (item) => item.organizationId === organizationId,
  );

  if (!membership) {
    return { error: "Organização indisponível para este usuário." };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_ORGANIZATION_COOKIE,
    membership.organizationId,
    COOKIE_OPTIONS,
  );

  redirect("/app");
}
