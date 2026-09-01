"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import {
  LAYOUT_FORMAT_VALUES,
  type LayoutFormat,
} from "@/features/documents/contracts";
import { HOME_SHORTCUTS, shortcutHref, templateRequiresPurpose, templateRequiresRecipient } from "@/features/documents/studio-presentation";
import { createStudioDocumentAction } from "@/features/documents/studio-actions";
import {
  getSystemTemplate,
  searchSystemTemplates,
  TEMPLATE_CATEGORY_LABELS,
  type SystemTemplateCategory,
} from "@/features/documents/system-templates";

export function NewDocumentWizard({
  patients,
  initialTemplateKey,
  initialCategory,
}: {
  patients: { id: string; preferred_name: string; full_name: string }[];
  initialTemplateKey?: string;
  initialCategory?: SystemTemplateCategory;
}) {
  const router = useRouter();
  const initial = initialTemplateKey ? getSystemTemplate(initialTemplateKey) : null;
  const [templateKey, setTemplateKey] = useState(initialTemplateKey ?? "");
  const [pickerQuery, setPickerQuery] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showPurpose, setShowPurpose] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [layoutFormat, setLayoutFormat] = useState<LayoutFormat>(
    initial?.supportsBooklet ? "livreto" : "tradicional",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const template = templateKey ? getSystemTemplate(templateKey) : null;
  const pickerMatches = useMemo(() => {
    const found = searchSystemTemplates(pickerQuery);
    if (!initialCategory || pickerQuery.trim()) return found;
    return found.filter((item) => item.category === initialCategory);
  }, [pickerQuery, initialCategory]);

  function selectTemplate(key: string) {
    setTemplateKey(key);
    const next = getSystemTemplate(key);
    if (next?.supportsBooklet) setLayoutFormat("livreto");
    else setLayoutFormat("tradicional");
    setShowPurpose(Boolean(next && templateRequiresPurpose(next)));
    setShowDetails(false);
    setShowOptions(false);
    setError(null);
  }

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

  const showRecipient = template ? templateRequiresRecipient(template) : false;
  const showPurposeField = template ? templateRequiresPurpose(template) || showPurpose : false;
  const patientOptional = Boolean(template && !template.guardrails.requiresPatient);
  const showPatient = Boolean(
    template &&
      (template.guardrails.requiresPatient ||
        template.guardrails.allowsMissingPatient ||
        template.requiredData.includes("patient.name")),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/app/documents" className="text-xs font-semibold text-primary">
        ← Documentos
      </Link>

      {!template ? (
        <section className="flex flex-col gap-4">
          <header>
            <h1 className="font-serif text-2xl font-bold italic text-foreground">
              Que documento você quer criar?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha um modelo. Os detalhes vêm depois.
            </p>
          </header>
          <SearchField
            value={pickerQuery}
            onChange={setPickerQuery}
            placeholder="Buscar um modelo..."
          />
          {!pickerQuery && !initialCategory ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {HOME_SHORTCUTS.filter((item) => item.category).map((item) => (
                <Link
                  key={item.id}
                  href={shortcutHref(item.category!)}
                  className="rounded-2xl border border-border bg-card px-3 py-3 text-sm font-semibold hover:border-primary/30"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
          {initialCategory && !pickerQuery ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {TEMPLATE_CATEGORY_LABELS[initialCategory]}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {pickerMatches.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => selectTemplate(item.key)}
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/30"
                >
                  <span className="block font-semibold text-foreground">{item.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <header>
            <h1 className="font-serif text-2xl font-bold italic text-foreground">{template.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">modelo selecionado</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary"
              onClick={() => setTemplateKey("")}
            >
              Trocar modelo
            </button>
          </header>

          {showPatient ? (
            <label className="flex flex-col gap-1.5" htmlFor="studio-patient">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {patientOptional ? "Paciente (opcional)" : "Paciente"}
              </span>
              <select
                id="studio-patient"
                aria-label="Paciente"
                className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
              >
                <option value="">
                  {template.guardrails.allowsMissingPatient ? "Sem paciente" : "Selecione…"}
                </option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.preferred_name} — {patient.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showRecipient ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Destinatário
              </span>
              <input
                className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Nome do destinatário, quando houver"
              />
            </label>
          ) : null}

          {showPurposeField ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Finalidade
              </span>
              <textarea
                rows={2}
                className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Para que este documento será usado?"
              />
            </label>
          ) : (
            <button
              type="button"
              className="text-left text-sm font-semibold text-primary"
              onClick={() => setShowPurpose(true)}
            >
              + Adicionar finalidade
            </button>
          )}

          {!showRecipient ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="text-left text-sm font-semibold text-primary"
                onClick={() => setShowDetails((current) => !current)}
                aria-expanded={showDetails}
              >
                {showDetails ? "Ocultar detalhes" : "+ Adicionar detalhes"}
              </button>
              {showDetails ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Destinatário
                    </span>
                    <input
                      className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="Nome do destinatário, quando houver"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {template.supportsBooklet ? (
            <div>
              <button
                type="button"
                className="text-left text-sm font-semibold text-primary"
                onClick={() => setShowOptions((current) => !current)}
                aria-expanded={showOptions}
              >
                {showOptions ? "Ocultar opções do documento" : "Opções do documento"}
              </button>
              {showOptions ? (
                <label className="mt-3 flex flex-col gap-1.5" htmlFor="studio-format">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Formato
                  </span>
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
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-failed">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" isLoading={isPending} onClick={submit} disabled={!templateKey}>
              Criar documento
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
