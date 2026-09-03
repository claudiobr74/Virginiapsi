"use client";

import { Check, Copy, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type {
  SessionMeetActionResult,
  SessionMeetStatus,
} from "@/features/sessions/session-meet-contracts";

export type SessionMeetRequestAction = (
  sessionId: string,
) => Promise<SessionMeetActionResult>;

export function SessionMeetAction({
  sessionId,
  meetUrl,
  status,
  canCreate,
  requestMeetAction,
}: {
  sessionId: string;
  meetUrl: string | null;
  status: SessionMeetStatus | null;
  canCreate: boolean;
  requestMeetAction?: SessionMeetRequestAction;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyMeetUrl() {
    if (!meetUrl) return;
    try {
      await navigator.clipboard.writeText(meetUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Não foi possível copiar o link automaticamente.");
    }
  }

  if (status === "ready" && meetUrl) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <a
            href={meetUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir Google Meet desta sessão em uma nova aba"
          >
            <Video className="size-3.5" aria-hidden />
            Abrir Google Meet
          </a>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyMeetUrl}
          aria-label="Copiar link do Google Meet desta sessão"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        {error ? (
          <p role="alert" className="w-full text-xs text-failed">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!canCreate || !requestMeetAction) {
    return null;
  }

  const meetAction = requestMeetAction;
  const label = status === "failed" ? "Tentar criar Google Meet" : "Criar Google Meet";

  function createAndOpenMeet() {
    setError(null);

    // Open synchronously from the user gesture so Safari/iPadOS does not block
    // the new tab while the server creates and persists the Meet space.
    const meetWindow = window.open("about:blank", "_blank");
    if (meetWindow) {
      meetWindow.opener = null;
    }

    startTransition(async () => {
      const result = await meetAction(sessionId);
      if (result.error || !result.meetUrl) {
        meetWindow?.close();
        setError(result.error ?? "O Google Meet não retornou um link válido.");
        router.refresh();
        return;
      }

      if (meetWindow) {
        meetWindow.location.href = result.meetUrl;
      } else {
        window.open(result.meetUrl, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        isLoading={isPending}
        onClick={createAndOpenMeet}
        aria-label={label}
      >
        <Video className="size-3.5" aria-hidden />
        {isPending ? "Preparando Google Meet…" : label}
      </Button>
      {error ? (
        <p role="alert" className="max-w-sm text-xs text-failed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
