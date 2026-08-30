"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  LAYOUT_FORMAT_VALUES,
  type LayoutFormat,
} from "@/features/documents/contracts";
import { createStudioDocumentAction } from "@/features/documents/studio-actions";
import {
  getSystemTemplate,
  listSystemTemplates,
  TEMPLATE_CATEGORY_LABELS,
} from "@/features/documents/system-templates";

export function NewDocumentWizard({
  patients,
  initialTemplateKey,
}: {
  patients: { id: string; preferred_name: string; full_name: string }[];
  initialTemplateKey?: string;
}) {
  const router = useRouter();
  const templates = useMemo(() => listSystemTemplates(), []);
  const initial = initialTemplateKey ? getSystemTemplate(initialTemplateKey) : null;
  const [templateKey, setTemplateKey] = useState(initialTemplateKey ?? "");
  const [patientId, setPatientId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [layoutFormat, setLayoutFormat] = useState<LayoutFormat>(
    initial?.supportsBooklet ? "livreto" : "tradicional",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const template = templateKey ? getSystemTemplate(templateKey) : null;

  function submit() {
    if (!template) {
      setError("Escolha um modelo.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStudioDocumentAction({
        templateKey: template.key,
        patientId: patientId || null,
        recipientName: recipientName || undefined,
        purpose: purpose || undefined,
        layoutFormat: template.supportsBooklet ? layoutFormat : undefined,
      });
      if (result.error || !result.id) {
        setError(result.error ?? "Não foi possível criar o documento.");
        return;
      }
      router.push(`/app/documents/${result.id}`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/app/documents" className="text-xs font-semibold text-primary">
        Voltar à biblioteca
      </Link>
      <header>
        <h1 className="font-serif text-2xl font-bold italic text-foreground">Novo documento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha a finalidade e o modelo. O texto-base é profissional e integralmente editável.
        </p>
      </header>

      <label className="flex flex-col gap-1.5" htmlFor="studio-template">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modelo</span>
        <select
          id="studio-template"
          aria-label="Modelo"
          className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
          value={templateKey}
          onChange={(event) => {
            setTemplateKey(event.target.value);
            const next = getSystemTemplate(event.target.value);
            if (next?.supportsBooklet) setLayoutFormat("livreto");
          }}
        >
          <option value="">Selecione…</option>
          {templates.map((item) => (
            <option key={item.key} value={item.key}>
              {TEMPLATE_CATEGORY_LABELS[item.category]} — {item.name}
            </option>
          ))}
        </select>
      </label>

      {template ? (
        <div className="rounded-2xl border border-border bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
          <p>{template.description}</p>
          <p className="mt-2 text-xs">{template.regulatoryGuidance}</p>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5" htmlFor="studio-patient">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Paciente {template && !template.guardrails.requiresPatient ? "(opcional neste modelo)" : ""}
        </span>
        <select
          id="studio-patient"
          aria-label="Paciente"
          className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
        >
          <option value="">{template?.guardrails.allowsMissingPatient ? "Sem paciente" : "Selecione…"}</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.preferred_name} — {patient.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Destinatário / solicitante
        </span>
        <input
          className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
          value={recipientName}
          onChange={(event) => setRecipientName(event.target.value)}
          placeholder="Nome do destinatário, quando houver"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Finalidade</span>
        <textarea
          rows={3}
          className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Para que este documento será usado?"
        />
      </label>

      {template?.supportsBooklet ? (
        <label className="flex flex-col gap-1.5" htmlFor="studio-format">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Formato</span>
          <select
            id="studio-format"
            aria-label="Formato"
            className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
            value={layoutFormat}
            onChange={(event) => setLayoutFormat(event.target.value as LayoutFormat)}
          >
            {LAYOUT_FORMAT_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === "livreto" ? "Livreto (editorial, por páginas)" : "Tradicional (A4 contínuo)"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" isLoading={isPending} onClick={submit} disabled={!templateKey}>
          Gerar estrutura
        </Button>
      </div>
    </div>
  );
}
