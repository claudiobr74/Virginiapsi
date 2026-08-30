"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusBadgeStatus } from "@/components/ui/status-badge";
import {
  OUTBOX_STATE_LABELS,
  TEMPLATE_LABELS,
  type PatientWhatsAppSnapshot,
} from "@/features/communications/contracts";
import {
  recordWhatsappConsentAction,
  revokeWhatsappConsentAction,
  sendWhatsappTemplateAction,
  setWhatsappPreferenceAction,
} from "@/features/communications/actions";

const OUTBOX_BADGE: Record<string, StatusBadgeStatus> = {
  scheduled: "pending",
  claimed: "pending",
  sending: "pending",
  sent: "confirmed",
  retryable_failed: "attention",
  permanent_failed: "failed",
  canceled: "cancelled",
};

export function WhatsappPanel({
  patientId,
  snapshot,
}: {
  patientId: string;
  snapshot: PatientWhatsAppSnapshot;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">Canal WhatsApp</span>
          <span className="text-xs text-muted-foreground">
            Integração opcional. Atualmente desativada enquanto custos e provedor são avaliados.
          </span>
          {!snapshot.operational ? (
            <span className="text-xs text-muted-foreground">
              Envios reais ficam indisponíveis até a avaliação comercial ser concluída.
            </span>
          ) : snapshot.phoneE164 ? (
            <span className="text-xs text-muted-foreground">{`Número ${snapshot.phoneE164}`}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Cadastre um telefone no paciente para enviar mensagens.
            </span>
          )}
        </div>
        <StatusBadge
          status={snapshot.allowed ? "active" : "cancelled"}
          label={snapshot.allowed ? "Ativo" : "Inativo"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {snapshot.hasWhatsappConsent ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            isLoading={isPending}
            onClick={() => {
              const consentId = snapshot.whatsappConsentId;
              if (!consentId) return;
              run(() => revokeWhatsappConsentAction(consentId, patientId));
            }}
          >
            Revogar consentimento
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={isPending}
            onClick={() => run(() => recordWhatsappConsentAction(patientId))}
          >
            Registrar consentimento
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={snapshot.allowed ? "secondary" : "primary"}
          isLoading={isPending}
          disabled={!snapshot.hasWhatsappConsent && !snapshot.allowed}
          onClick={() =>
            run(() =>
              setWhatsappPreferenceAction({
                patientId,
                enabled: !snapshot.allowed,
              }),
            )
          }
        >
          {snapshot.allowed ? "Desativar canal" : "Ativar canal"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={isPending}
          disabled={!snapshot.operational || !snapshot.allowed}
          onClick={() =>
            run(() =>
              sendWhatsappTemplateAction({ patientId, templateKey: "confirmation" }),
            )
          }
        >
          Enviar confirmação
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={isPending}
          disabled={!snapshot.operational || !snapshot.allowed}
          onClick={() =>
            run(() => sendWhatsappTemplateAction({ patientId, templateKey: "welcome" }))
          }
        >
          Enviar boas-vindas
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={isPending}
          disabled={!snapshot.operational || !snapshot.allowed}
          onClick={() =>
            run(() => sendWhatsappTemplateAction({ patientId, templateKey: "billing" }))
          }
        >
          Enviar cobrança
        </Button>
      </div>

      {snapshot.templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Modelos
          </span>
          <ul className="flex flex-col gap-2">
            {snapshot.templates.map((template) => (
              <li
                key={template.id}
                className="rounded-xl border border-border px-3.5 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">
                  {TEMPLATE_LABELS[template.template_key]}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">{template.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="Modelos ainda não gerados"
          description="Ative o canal para criar os textos padrão de confirmação, lembrete, boas-vindas e cobrança."
        />
      )}

      {snapshot.outbox.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Lembretes 24h / 2h
          </span>
          <ul className="flex flex-col gap-2">
            {snapshot.outbox.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2 text-sm"
              >
                <span>
                  {item.reminder_type === "reminder_24h" ? "24h" : "2h"} —{" "}
                  {new Date(item.scheduled_for).toLocaleString("pt-BR")}
                </span>
                <StatusBadge
                  status={OUTBOX_BADGE[item.state] ?? "info"}
                  label={OUTBOX_STATE_LABELS[item.state]}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot.messages.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Envios recentes
          </span>
          <ul className="flex flex-col gap-2">
            {snapshot.messages.map((message) => (
              <li
                key={message.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2 text-sm"
              >
                <span>
                  {message.template_key
                    ? TEMPLATE_LABELS[message.template_key]
                    : "Mensagem"}{" "}
                  · {message.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.created_at).toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot.inbound.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Respostas
          </span>
          <ul className="flex flex-col gap-2">
            {snapshot.inbound.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2 text-sm"
              >
                <span>{row.body_redacted ?? row.intent}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
