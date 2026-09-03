"use client";

import { Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type {
  AppointmentModality,
  AppointmentOrigin,
  MeetStatus,
} from "@/features/calendar/contracts";

export type MeetRequestAction = (
  appointmentId: string,
) => Promise<{ error?: string; syncedCount?: number }>;

export function MeetActionButton({
  appointmentId,
  modality,
  origin,
  meetUrl,
  meetStatus,
  requestMeetAction,
  size = "sm",
  variant = "secondary",
  className,
}: {
  appointmentId: string;
  modality: AppointmentModality;
  origin: AppointmentOrigin;
  meetUrl: string | null;
  meetStatus: MeetStatus;
  requestMeetAction?: MeetRequestAction;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (modality !== "online") {
    return null;
  }

  if (meetStatus === "success" && meetUrl) {
    return (
      <Button asChild size={size} variant={variant} className={className}>
        <a
          href={meetUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir Google Meet em uma nova aba"
        >
          <Video className="size-3.5" aria-hidden />
          Abrir Google Meet
        </a>
      </Button>
    );
  }

  // Imported Google events remain read-only. Managed appointments need a
  // server-action reference supplied by the Server Component boundary. This
  // keeps the client component free of server-only transitive imports while
  // preserving the existing Calendar/Meet implementation.
  if (origin !== "TESSELI" || !requestMeetAction) {
    return null;
  }

  const label = meetStatus === "pending" ? "Verificar Google Meet" : "Criar Google Meet";

  function resolveMeet() {
    setError(null);
    startTransition(async () => {
      const result = await requestMeetAction(appointmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        isLoading={isPending}
        onClick={resolveMeet}
        aria-label={label}
      >
        <Video className="size-3.5" aria-hidden />
        {isPending ? "Consultando Google Meet…" : label}
      </Button>
      {error ? (
        <p role="alert" className="max-w-sm text-xs text-failed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
