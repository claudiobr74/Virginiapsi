"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startSessionAction } from "@/features/sessions/actions";

export function StartSessionButton({
  patientId,
  appointmentId,
}: {
  patientId: string;
  appointmentId?: string;
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
      <Button type="button" size="sm" isLoading={isPending} onClick={start}>
        <PlayCircle className="size-4" aria-hidden />
        Iniciar sessão
      </Button>
    </div>
  );
}
