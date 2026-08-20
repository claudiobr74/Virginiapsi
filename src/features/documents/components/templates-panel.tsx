"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTemplateAction } from "@/features/documents/actions";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_VALUES,
  FORCED_ADMINISTRATIVE_KINDS,
  FORCED_CLINICAL_KINDS,
  type DocumentKind,
  type DocumentTemplateRow,
} from "@/features/documents/contracts";

export function TemplatesPanel({ templates }: { templates: DocumentTemplateRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [documentKind, setDocumentKind] = useState<DocumentKind>("atestado");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const forced = FORCED_CLINICAL_KINDS.includes(documentKind)
    ? "clinical"
    : FORCED_ADMINISTRATIVE_KINDS.includes(documentKind)
      ? "administrative"
      : "administrative";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTemplateAction({
        name,
        documentKind,
        defaultSensitivity: forced,
        bodyTemplate,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      setBodyTemplate("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum modelo ainda.</p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-foreground">{template.name}</span>
              <span className="text-muted-foreground"> — {DOCUMENT_KIND_LABELS[template.document_kind]}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Input placeholder="Nome do modelo" value={name} onChange={(event) => setName(event.target.value)} />
        <select
          className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
          value={documentKind}
          onChange={(event) => setDocumentKind(event.target.value as DocumentKind)}
        >
          {DOCUMENT_KIND_VALUES.map((kind) => (
            <option key={kind} value={kind}>
              {DOCUMENT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <textarea
          rows={4}
          placeholder="Corpo do modelo com variáveis, ex.: {{patient.full_name}}"
          className="rounded-xl border border-border bg-input px-3.5 py-2.5 font-mono text-sm"
          value={bodyTemplate}
          onChange={(event) => setBodyTemplate(event.target.value)}
        />
        {error ? <p className="text-xs text-failed">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="button" size="sm" isLoading={isPending} disabled={!name.trim()} onClick={submit}>
            <Plus className="size-4" aria-hidden />
            Criar modelo
          </Button>
        </div>
      </div>
    </div>
  );
}
