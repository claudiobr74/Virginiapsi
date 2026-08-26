"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startSessionAction } from "@/features/sessions/actions";
import { cn } from "@/lib/utils/cn";

export function StartSessionButton({
  patientId,
  appointmentId,
  label = "Iniciar sessão",
  size = "sm",
  className,
  iconOnly = false,
}: {
  patientId: string;
  appointmentId?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startSessionAction(patientId, appointmentId);
      if (result.error || !result.sessionId) {
        setError(result.error ?? "Não foi possível iniciar a sessão.");
        return;
      }
      router.push(`/session/${result.sessionId}`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-xs text-failed">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size={size}
        isLoading={isPending}
        onClick={start}
        className={className}
        aria-label={iconOnly ? label : undefined}
      >
        <PlayCircle className={cn("size-4", iconOnly && "size-4")} aria-hidden />
        {iconOnly ? null : label}
      </Button>
    </div>
  );
}
