"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CAPTURE_CONSENT_TYPES,
  CONSENT_DENIAL_MESSAGES,
  CONSENT_TYPE_LABELS,
  type CaptureConsentType,
  type ConsentResolution,
  type ConsentRow,
} from "@/features/consents/contracts";
import { recordConsentAction, revokeConsentAction } from "@/features/consents/actions";

const AGE_GROUP_LABELS = {
  child: "Criança (autorização do responsável obrigatória)",
  adolescent: "Adolescente (autorização do responsável e anuência obrigatórias)",
  adult: "Maior de idade",
  unknown: "Data de nascimento ausente no cadastro",
} as const;

export function ConsentPanel({
  patientId,
  resolution,
  consents,
}: {
  patientId: string;
  resolution: ConsentResolution;
  consents: ConsentRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardianAuthorization, setGuardianAuthorization] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [patientAssent, setPatientAssent] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ConsentRow | null>(null);

  const isMinor = resolution.ageGroup === "child" || resolution.ageGroup === "adolescent";
  const requiresAssent = resolution.ageGroup === "adolescent";

  const activeByType = new Map<CaptureConsentType, ConsentRow>();
  for (const type of CAPTURE_CONSENT_TYPES) {
    const latest = consents.find((consent) => consent.type === type);
    if (latest) {
      activeByType.set(type, latest);
    }
  }

  function run(action: () => Promise<{ error?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  const allowedByType: Record<CaptureConsentType, boolean> = {
    ai_processing: resolution.state.aiProcessingAllowed,
    session_recording: resolution.state.recordingAllowed,
    session_transcription: resolution.state.transcriptionAllowed,
  };

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

      <p className="text-sm text-muted-foreground">
        {AGE_GROUP_LABELS[resolution.ageGroup]}. Sem consentimento válido, o
        SerenaPsi não emite token de transcrição nem permissão de upload de
        áudio — e o atendimento segue normalmente sem gravação.
      </p>

      <div className="flex flex-col gap-2">
        {CAPTURE_CONSENT_TYPES.map((type) => {
          const consent = activeByType.get(type);
          const allowed = allowedByType[type];
          const denial = resolution.denials[type];

          return (
            <div
              key={type}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {CONSENT_TYPE_LABELS[type]}
                </span>
                {allowed ? (
                  <span className="text-xs text-muted-foreground">
                    Versão {consent?.version} — registrado em{" "}
                    {consent?.accepted_at
                      ? new Date(consent.accepted_at).toLocaleString("pt-BR")
                      : "—"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {denial ? CONSENT_DENIAL_MESSAGES[denial] : "Sem consentimento válido."}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge
                  status={allowed ? "active" : "cancelled"}
                  label={allowed ? "Válido" : "Bloqueado"}
                />
                {allowed && consent ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    aria-label={`Revogar ${CONSENT_TYPE_LABELS[type]}`}
                    onClick={() => setRevokeTarget(consent)}
                  >
                    Revogar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Registrar ${CONSENT_TYPE_LABELS[type]}`}
                    isLoading={isPending}
                    disabled={resolution.ageGroup === "unknown"}
                    onClick={() =>
                      run(() =>
                        recordConsentAction({
                          patientId,
                          type,
                          guardianAuthorization,
                          guardianName,
                          patientAssent,
                        }),
                      )
                    }
                  >
                    Registrar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
            <Label htmlFor="guardianName">Nome do responsável</Label>
            <Input
              id="guardianName"
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

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revogar consentimento?"
        description="A gravação, a transcrição e o apoio de IA ficam bloqueados imediatamente. O histórico do consentimento é preservado."
        confirmLabel="Revogar"
        isLoading={isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          run(
            () => revokeConsentAction(revokeTarget.id, patientId),
            () => setRevokeTarget(null),
          );
        }}
      />
    </div>
  );
}
