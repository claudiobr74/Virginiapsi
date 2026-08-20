"use client";

import { Download, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { revokeConsentAction } from "@/features/consents/actions";
import {
  acceptTcleAction,
  requestConsentFileDownloadUrlAction,
} from "@/features/consents/tcle-actions";
import { TCLE_LEGAL_REVIEW_DISCLAIMER, TCLE_VERSION } from "@/features/consents/tcle-content";
import { TCLE_CONSENT_TYPES, resolveTcleStatus, type TcleConsentType } from "@/features/consents/tcle";
import type { ConsentRow } from "@/features/consents/contracts";

const TYPE_LABELS: Record<TcleConsentType, string> = {
  service_terms: "Termos de Serviço",
  psychotherapy: "TCLE de Psicoterapia",
};

const STATUS_BADGE = {
  never_accepted: { status: "pending" as const, label: "Não aceito" },
  current: { status: "active" as const, label: "Aceito — versão vigente" },
  outdated: { status: "attention" as const, label: "Aceito em versão anterior" },
  revoked: { status: "cancelled" as const, label: "Revogado" },
};

export function TclePanel({
  patientId,
  consents,
  isMinor,
  requiresAssent,
}: {
  patientId: string;
  consents: ConsentRow[];
  isMinor: boolean;
  requiresAssent: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardianAuthorization, setGuardianAuthorization] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [patientAssent, setPatientAssent] = useState(false);

  function accept(type: TcleConsentType) {
    setError(null);
    startTransition(async () => {
      const result = await acceptTcleAction({
        patientId,
        type,
        guardianAuthorization,
        guardianName,
        patientAssent,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function revoke(consentId: string) {
    startTransition(async () => {
      await revokeConsentAction(consentId, patientId);
      router.refresh();
    });
  }

  async function download(consentId: string) {
    const result = await requestConsentFileDownloadUrlAction(consentId);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-xs text-attention">
        {TCLE_LEGAL_REVIEW_DISCLAIMER} Versão atual: {TCLE_VERSION}.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}

      {TCLE_CONSENT_TYPES.map((type) => {
        const resolution = resolveTcleStatus(consents, type, TCLE_VERSION);
        const badge = STATUS_BADGE[resolution.status];
        const canAccept = resolution.status !== "current";

        return (
          <div
            key={type}
            data-testid={`tcle-row-${type}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{TYPE_LABELS[type]}</span>
              {resolution.latest ? (
                <span className="text-xs text-muted-foreground">
                  Versão {resolution.latest.version} — {resolution.latest.accepted_at
                    ? new Date(resolution.latest.accepted_at).toLocaleString("pt-BR")
                    : "—"}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={badge.status} label={badge.label} />
              {resolution.latest && resolution.status !== "revoked" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label={`Baixar PDF de ${TYPE_LABELS[type]}`}
                  onClick={() => void download(resolution.latest!.id)}
                >
                  <Download className="size-3.5" aria-hidden />
                </Button>
              ) : null}
              {resolution.status === "current" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  isLoading={isPending}
                  onClick={() => revoke(resolution.latest!.id)}
                >
                  Revogar
                </Button>
              ) : canAccept ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={isPending}
                  onClick={() => accept(type)}
                >
                  Registrar aceite
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      {isMinor ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-attention/30 bg-attention-bg px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-attention">
            <ShieldCheck className="size-4" aria-hidden />
            Paciente menor de idade
          </span>
          <label className="flex items-center gap-2 text-sm text-attention">
            <input
              type="checkbox"
              checked={guardianAuthorization}
              onChange={(event) => setGuardianAuthorization(event.target.checked)}
            />
            Autorização do responsável registrada
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tcleGuardianName">Nome do responsável</Label>
            <Input
              id="tcleGuardianName"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value)}
            />
          </div>
          {requiresAssent ? (
            <label className="flex items-center gap-2 text-sm text-attention">
              <input
                type="checkbox"
                checked={patientAssent}
                onChange={(event) => setPatientAssent(event.target.checked)}
              />
              Anuência do adolescente registrada
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
