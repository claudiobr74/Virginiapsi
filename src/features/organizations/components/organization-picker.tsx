"use client";

import { Building2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { selectActiveOrganizationAction } from "@/features/organizations/actions";
import type { Membership } from "@/features/organizations/contracts";
import { ROLE_LABELS } from "@/features/organizations/labels";

export function OrganizationPicker({
  memberships,
}: {
  memberships: Membership[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function select(organizationId: string) {
    setError(null);
    setPendingId(organizationId);
    startTransition(async () => {
      const result = await selectActiveOrganizationAction(organizationId);
      if (result?.error) {
        setError(result.error);
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {error}
        </p>
      ) : null}

      {memberships.map((membership) => (
        <div
          key={membership.organizationId}
          className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-sage-700">
              <Building2 className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {membership.organizationName}
              </span>
              <StatusBadge
                status={
                  membership.role === "psychologist_admin" ? "active" : "info"
                }
                label={ROLE_LABELS[membership.role]}
                className="mt-1 w-fit"
              />
            </div>
          </div>
          <Button
            size="sm"
            isLoading={isPending && pendingId === membership.organizationId}
            onClick={() => select(membership.organizationId)}
          >
            Entrar
          </Button>
        </div>
      ))}
    </div>
  );
}
