"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { cancelDocumentAction, signDocumentAction } from "@/features/documents/actions";
import { DocumentDownloadButton } from "@/features/documents/components/patient-documents-panel";
import {
  DELIVERY_METHOD_VALUES,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TONE_VALUES,
  DOCUMENT_AI_COMMANDS,
  LENGTH_PRESET_VALUES,
  LOGO_ALIGN_VALUES,
  LOGO_MODE_VALUES,
  LOGO_SIZE_VALUES,
  VISUAL_PROFILE_VALUES,
  type DocumentDeliveryRow,
  type DocumentFileRow,
  type DocumentProfessionalSignatureRow,
  type DocumentRow,
  type DocumentSection,
  type DocumentSectionType,
  type DocumentVersionRow,
} from "@/features/documents/contracts";
import { createSection, moveSection, sortSections } from "@/features/documents/sections";
import { documentStatusTone } from "@/features/documents/status-presentation";
import { getSystemTemplate } from "@/features/documents/system-templates";
import {
  duplicateDocumentAction,
  generateDocumentAiDraftAction,
  importScheduledEncountersAction,
  issueStudioDocumentAction,
  markDocumentReviewedAction,
  previewDocumentAiContextAction,
  registerDeliveryAction,
  saveDocumentAsTemplateAction,
  saveStudioDraftAction,
} from "@/features/documents/studio-actions";
import { INTERNAL_SIGNATURE_DISCLAIMER } from "@/features/documents/internal-signature";
import { hasUnresolvedPlaceholders } from "@/lib/documents/render-template";

const ADD_TYPES: { type: DocumentSectionType; label: string }[] = [
  { type: "text", label: "Texto" },
  { type: "analysis", label: "Análise" },
  { type: "conclusion", label: "Conclusão" },
  { type: "observation", label: "Observação" },
  { type: "table", label: "Tabela" },
  { type: "references", label: "Referências" },
  { type: "page_break", label: "Página nova" },
];

export function StudioEditor({
  document,
  latestVersion,
  file,
  versions,
  signature = null,
  deliveries,
}: {
  document: DocumentRow;
  latestVersion: DocumentVersionRow | null;
  file: DocumentFileRow | null;
  versions: DocumentVersionRow[];
  signature?: DocumentProfessionalSignatureRow | null;
  deliveries: DocumentDeliveryRow[];
}) {
  const router = useRouter();
  const template = document.system_template_key
    ? getSystemTemplate(document.system_template_key)
    : null;
  const [sections, setSections] = useState<DocumentSection[]>(
    sortSections(latestVersion?.sections_snapshot?.length ? latestVersion.sections_snapshot : [
      {
        id: "body",
        type: "text",
        title: "",
        content: latestVersion?.body_snapshot ?? "",
        order: 0,
        enabled: true,
        pageBreakBefore: false,
      },
    ]),
  );
  const [purpose, setPurpose] = useState(document.purpose ?? "");
  const [recipientName, setRecipientName] = useState(document.recipient_name ?? "");
  const [visualProfile, setVisualProfile] = useState(document.visual_profile);
  const [logoMode, setLogoMode] = useState(document.logo_mode);
  const [logoAlign, setLogoAlign] = useState(document.logo_align);
  const [logoSize, setLogoSize] = useState(document.logo_size);
  const [coverEnabled, setCoverEnabled] = useState(document.cover_enabled);
  const [layoutFormat, setLayoutFormat] = useState(document.layout_format);
  const [tone, setTone] = useState(document.tone);
  const [lengthPreset, setLengthPreset] = useState(document.length_preset);
  const [focus, setFocus] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReview, setConfirmReview] = useState(false);
  const [purposeOk, setPurposeOk] = useState(false);
  const [foundationOk, setFoundationOk] = useState(false);
  const [assessmentOk, setAssessmentOk] = useState(false);
  const [previewOk, setPreviewOk] = useState(false);
  const [aiPreview, setAiPreview] = useState("");
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiReviewNotes, setAiReviewNotes] = useState<string[]>([]);
  const [packedPreview, setPackedPreview] = useState<string>("");
  const [compareId, setCompareId] = useState<string>("");
  const [delivery, setDelivery] = useState({
    recipientName: "",
    deliveredAt: new Date().toISOString().slice(0, 16),
    method: "presencial" as const,
    receiptConfirmed: false,
    devolutionDone: false,
    notes: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditable =
    document.status === "draft" || document.status === "under_review";
  const canIssue =
    isEditable || document.status === "reviewed";
  const [contextAck, setContextAck] = useState(false);
  const [aiCommand, setAiCommand] = useState<string>("");
  const [chartImport, setChartImport] = useState({
    formulation: false,
    therapyGoals: false,
    lastSession: false,
    lastThreeSessions: false,
    dpep: false,
  });
  const unresolved = sections.some(
    (section) =>
      section.enabled && hasUnresolvedPlaceholders(`${section.title}\n${section.content}`),
  );

  const persist = useCallback(
    (nextSections: DocumentSection[]) => {
      if (!isEditable) return;
      setSaveState("saving");
      startTransition(async () => {
        const result = await saveStudioDraftAction({
          documentId: document.id,
          sections: nextSections,
          purpose,
          recipientName,
          visualProfile,
          logoMode,
          logoAlign,
          logoSize,
          coverEnabled,
          layoutFormat,
          tone,
          lengthPreset,
        });
        if (result.error) {
          setError(result.error);
          setSaveState("idle");
          return;
        }
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2500);
      });
    },
    [
      coverEnabled,
      document.id,
      isEditable,
      layoutFormat,
      lengthPreset,
      logoAlign,
      logoMode,
      logoSize,
      purpose,
      recipientName,
      setError,
      startTransition,
      tone,
      visualProfile,
    ],
  );

  useEffect(() => {
    if (!isEditable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(sections), 2200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sections, persist, isEditable]);

  function updateSection(id: string, patch: Partial<DocumentSection>) {
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  }

  const compareVersion = useMemo(
    () => versions.find((version) => version.id === compareId) ?? null,
    [compareId, versions],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div>
          <Link href="/app/documents" className="text-xs font-semibold text-primary">
            Voltar ao estúdio
          </Link>
          <h1 className="mt-1 font-serif text-xl font-bold italic text-foreground">{document.title}</h1>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_KIND_LABELS[document.document_kind]}
            {template ? ` · ${template.name}` : ""}
            {document.sensitivity === "clinical" ? " · Clínico" : " · Administrativo"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={documentStatusTone(document.status)}
            label={DOCUMENT_STATUS_LABELS[document.status]}
          />
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" ? "Salvando…" : saveState === "saved" ? "Salvo agora" : `v${document.current_version}`}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setFocus((value) => !value)}>
            {focus ? "Mostrar painéis" : "Modo foco"}
          </Button>
          {document.status !== "canceled" ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      {document.reviewed_at ? (
        <p className="rounded-xl border border-success/30 bg-success-bg px-4 py-2 text-sm text-success">
          Revisado e aprovado pela profissional em {new Date(document.reviewed_at).toLocaleString("pt-BR")}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
          {success}
        </p>
      ) : null}

      <div className={focus ? "grid grid-cols-1" : "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]"}>
        {focus ? null : (
          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Configuração</p>
              <label className="mt-3 flex flex-col gap-1 text-xs">
                Destinatário
                <input
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </label>
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Finalidade
                <textarea
                  disabled={!isEditable}
                  rows={3}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Perfil visual
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={visualProfile}
                  onChange={(event) => setVisualProfile(event.target.value as typeof visualProfile)}
                >
                  {VISUAL_PROFILE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Logo
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={logoMode}
                  onChange={(event) => setLogoMode(event.target.value as typeof logoMode)}
                >
                  {LOGO_MODE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value === "clinic_default" ? "Padrão da clínica" : value === "none" ? "Sem logo" : value}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs"
                  value={logoAlign}
                  onChange={(event) => setLogoAlign(event.target.value as typeof logoAlign)}
                >
                  {LOGO_ALIGN_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs"
                  value={logoSize}
                  onChange={(event) => setLogoSize(event.target.value as typeof logoSize)}
                >
                  {LOGO_SIZE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              {template?.supportsCover ? (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={coverEnabled}
                    disabled={!isEditable}
                    onChange={(event) => setCoverEnabled(event.target.checked)}
                  />
                  Capa
                </label>
              ) : null}
              {template?.supportsBooklet ? (
                <label className="mt-2 flex flex-col gap-1 text-xs">
                  Formato
                  <select
                    aria-label="Formato"
                    disabled={!isEditable}
                    className="rounded-lg border border-border bg-input px-2 py-1.5"
                    value={layoutFormat}
                    onChange={(event) => setLayoutFormat(event.target.value as typeof layoutFormat)}
                  >
                    <option value="tradicional">Tradicional</option>
                    <option value="livreto">Livreto</option>
                  </select>
                </label>
              ) : null}
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Tom
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={tone}
                  onChange={(event) => setTone(event.target.value as typeof tone)}
                >
                  {DOCUMENT_TONE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 flex flex-col gap-1 text-xs">
                Extensão
                <select
                  disabled={!isEditable}
                  className="rounded-lg border border-border bg-input px-2 py-1.5"
                  value={lengthPreset}
                  onChange={(event) => setLengthPreset(event.target.value as typeof lengthPreset)}
                >
                  {LENGTH_PRESET_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isEditable && document.document_kind === "contrato" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  startTransition(async () => {
                    const result = await importScheduledEncountersAction(document.id);
                    if (result.error || !result.encounters) {
                      setError(result.error ?? "Agenda indisponível.");
                      return;
                    }
                    setSections((current) =>
                      current.map((section) =>
                        section.title.toLowerCase().includes("dados do atendimento")
                          ? {
                              ...section,
                              content: section.content.replace(
                                "{{schedule.encounters}}",
                                result.encounters ?? "",
                              ),
                            }
                          : section,
                      ),
                    );
                    setSuccess("Encontros da agenda importados. Revise o quadro.");
                  })
                }
              >
                Importar encontros da agenda
              </Button>
            ) : null}

            {isEditable ? (
              <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Redação assistida
                </p>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  A IA não inventa fatos. Confirme o contexto. O rascunho nunca é emitido sozinho.
                </p>
                {template?.interviewPrompts?.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                    {template.interviewPrompts.map((prompt) => (
                      <li key={prompt}>{prompt}</li>
                    ))}
                  </ul>
                ) : null}
                {document.patient_id ? (
                  <fieldset className="mt-2 space-y-1 text-[11px]">
                    <legend className="font-semibold">Importar do prontuário (só o selecionado)</legend>
                    {(
                      [
                        ["formulation", "Formulação"],
                        ["therapyGoals", "Objetivos"],
                        ["lastSession", "Última sessão / evolução"],
                        ["lastThreeSessions", "Últimas sessões"],
                        ["dpep", "Procedimentos / DPEP"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={chartImport[key]}
                          onChange={(event) =>
                            setChartImport((current) => ({ ...current, [key]: event.target.checked }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Notas da profissional (opcional)
                </p>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1.5 text-xs"
                  placeholder="Respostas às perguntas acima — não substituem o texto do documento nem a importação selecionada"
                  value={aiPreview}
                  onChange={(event) => setAiPreview(event.target.value)}
                />
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Dados que serão utilizados
                </p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[10px] text-muted-foreground">
                  {packedPreview ||
                    "Atualize a prévia para ver exatamente o envelope enviado à IA (finalidade, texto atual, notas e fatias selecionadas do prontuário)."}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const importing = Object.values(chartImport).some(Boolean);
                      const result = await previewDocumentAiContextAction({
                        documentId: document.id,
                        command: aiCommand
                          ? (aiCommand as (typeof DOCUMENT_AI_COMMANDS)[number])
                          : undefined,
                        answers: aiPreview ? { notas: aiPreview } : undefined,
                        selectedContext: importing
                          ? { ...chartImport, additionalNotes: false }
                          : undefined,
                      });
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      setPackedPreview(result.preview ?? "");
                      setContextAck(false);
                    })
                  }
                >
                  Atualizar prévia do contexto
                </Button>
                <label className="mt-2 flex items-start gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={contextAck}
                    onChange={(event) => setContextAck(event.target.checked)}
                  />
                  Confirmo os dados acima como o único contexto enviado à IA.
                </label>
                <label className="mt-2 flex flex-col gap-1 text-[11px]">
                  Comando
                  <select
                    className="rounded-lg border border-border bg-input px-2 py-1.5"
                    value={aiCommand}
                    onChange={(event) => setAiCommand(event.target.value)}
                  >
                    <option value="">Gerar rascunho das seções</option>
                    {DOCUMENT_AI_COMMANDS.map((command) => (
                      <option key={command} value={command}>
                        {command}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  isLoading={isPending}
                  disabled={!contextAck}
                  onClick={() =>
                    startTransition(async () => {
                      const importing = Object.values(chartImport).some(Boolean);
                      const payload = {
                        documentId: document.id,
                        command: aiCommand
                          ? (aiCommand as (typeof DOCUMENT_AI_COMMANDS)[number])
                          : undefined,
                        answers: aiPreview ? { notas: aiPreview } : undefined,
                        selectedContext: importing
                          ? { ...chartImport, additionalNotes: false }
                          : undefined,
                      };
                      const preview = await previewDocumentAiContextAction(payload);
                      if (preview.error || !preview.previewHash) {
                        setError(preview.error ?? "Não foi possível montar a prévia do contexto.");
                        return;
                      }
                      setPackedPreview(preview.preview ?? "");
                      const result = await generateDocumentAiDraftAction({
                        ...payload,
                        contextPreviewAcknowledged: true as const,
                        previewHash: preview.previewHash,
                      });
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      setAiDraft(result.draft ?? null);
                      setAiReviewNotes(result.reviewNotes ?? []);
                      setSuccess(
                        result.model
                          ? `Rascunho gerado (${result.model}). Revise antes de incorporar.`
                          : "Rascunho gerado. Revise antes de incorporar.",
                      );
                    })
                  }
                >
                  Gerar rascunho
                </Button>
                {aiDraft ? (
                  <div className="mt-3">
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[11px]">
                      {aiDraft}
                    </pre>
                    {aiReviewNotes.length > 0 ? (
                      <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground">
                        {aiReviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => {
                        const last = sections[sections.length - 1];
                        if (!last) return;
                        updateSection(last.id, {
                          content: `${last.content}\n\n${aiDraft}`,
                        });
                        setAiDraft(null);
                      }}
                    >
                      Inserir na última seção (ainda é rascunho)
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Versões</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {versions.map((version) => (
                  <li key={version.id}>
                    <button type="button" className="text-left text-primary" onClick={() => setCompareId(version.id)}>
                      v{version.version} · {new Date(version.created_at).toLocaleString("pt-BR")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
              {["# Título", "## Subtítulo", "**negrito**", "*itálico*", "- lista", "1. numerada", "[page-break]", "| col | col |"].map(
                (hint) => (
                  <span key={hint} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                    {hint}
                  </span>
                ),
              )}
            </div>
            <div className="flex flex-col gap-4">
              {sections.map((section, index) => (
                <article key={section.id} className="rounded-2xl border border-border bg-background p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      disabled={!isEditable}
                      className="flex-1 rounded-lg border border-border bg-input px-2 py-1 text-sm font-semibold"
                      value={section.title}
                      onChange={(event) => updateSection(section.id, { title: event.target.value })}
                      placeholder="Título da seção"
                    />
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        disabled={!isEditable}
                        onChange={(event) => updateSection(section.id, { enabled: event.target.checked })}
                      />
                      Ativa
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={section.pageBreakBefore}
                        disabled={!isEditable}
                        onChange={(event) =>
                          updateSection(section.id, { pageBreakBefore: event.target.checked })
                        }
                      />
                      Quebra
                    </label>
                    {isEditable ? (
                      <>
                        <button type="button" className="text-[11px]" onClick={() => setSections(moveSection(sections, section.id, "up"))}>
                          ↑
                        </button>
                        <button type="button" className="text-[11px]" onClick={() => setSections(moveSection(sections, section.id, "down"))}>
                          ↓
                        </button>
                      </>
                    ) : null}
                  </div>
                  {section.type === "page_break" ? (
                    <p className="text-xs text-muted-foreground">Quebra de página</p>
                  ) : (
                    <textarea
                      disabled={!isEditable}
                      rows={8}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6"
                      value={section.content}
                      onChange={(event) => updateSection(section.id, { content: event.target.value })}
                    />
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">Seção {index + 1}</p>
                </article>
              ))}
            </div>
            {isEditable ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {ADD_TYPES.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 text-xs"
                    onClick={() =>
                      setSections((current) => [
                        ...current,
                        createSection({
                          type: item.type,
                          title: item.type === "page_break" ? "" : item.label,
                          content: item.type === "table" ? "| | |\n| --- | --- |\n| | |" : "",
                          order: current.length,
                          pageBreakBefore: item.type === "page_break",
                        }),
                      ])
                    }
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showPreview ? (
            <div className="rounded-3xl border border-border bg-card p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Preview (mesmo renderer do PDF)
                </p>
                <button type="button" className="text-xs text-primary" onClick={() => setShowPreview(false)}>
                  Ocultar
                </button>
              </div>
              <iframe
                title="Pré-visualização do PDF"
                src={`/app/documents/${document.id}/preview`}
                className="h-[70vh] w-full rounded-xl border border-border bg-white"
              />
            </div>
          ) : (
            <button type="button" className="text-xs text-primary" onClick={() => setShowPreview(true)}>
              Mostrar preview PDF
            </button>
          )}

          {compareVersion ? (
            <div className="rounded-3xl border border-border bg-card p-4 text-xs">
              <p className="font-semibold">Comparar com v{compareVersion.version}</p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{compareVersion.body_snapshot}</pre>
            </div>
          ) : null}

          {canIssue ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Checklist de emissão
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>{document.title.trim() ? "✓" : "☐"} Identificação / título</li>
                <li>{recipientName.trim() || !template?.requiredData.includes("recipient.name") ? "✓" : "☐"} Solicitante</li>
                <li>{purpose.trim() ? "✓" : "☐"} Finalidade</li>
                <li>{unresolved ? "☐ Placeholders pendentes" : "✓ Sem placeholders pendentes"}</li>
                <li>{document.reviewed_at ? "✓ Revisão concluída" : "☐ Revisão"}</li>
                <li>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={previewOk} onChange={(event) => setPreviewOk(event.target.checked)} />
                    Preview conferido
                  </label>
                </li>
                {document.sensitivity === "clinical" ? (
                  <>
                    <li>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={confirmReview}
                          onChange={(event) => setConfirmReview(event.target.checked)}
                        />
                        Confirmo que revisei integralmente o documento.
                      </label>
                    </li>
                    <li>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={purposeOk}
                          onChange={(event) => setPurposeOk(event.target.checked)}
                        />
                        Confirmo que o conteúdo está adequado à finalidade.
                      </label>
                    </li>
                  </>
                ) : null}
                {template?.guardrails.requiresTechnicalFoundation ? (
                  <li>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={foundationOk}
                        onChange={(event) => setFoundationOk(event.target.checked)}
                      />
                      Confirmo que existe fundamentação técnica suficiente para este Atestado Psicológico.
                    </label>
                  </li>
                ) : null}
                {template?.guardrails.requiresCompatibleAssessment ? (
                  <li>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={assessmentOk}
                        onChange={(event) => setAssessmentOk(event.target.checked)}
                      />
                      Confirmo que houve avaliação psicológica compatível.
                    </label>
                  </li>
                ) : null}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {isEditable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    isLoading={isPending}
                    onClick={() => persist(sections)}
                  >
                    Salvar rascunho
                  </Button>
                ) : null}
                {isEditable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await markDocumentReviewedAction({ documentId: document.id });
                        if (result.error) setError(result.error);
                        else router.refresh();
                      })
                    }
                  >
                    Registrar revisão
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  isLoading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      if (isEditable) {
                        const saved = await saveStudioDraftAction({
                          documentId: document.id,
                          sections,
                          purpose,
                          recipientName,
                          visualProfile,
                          logoMode,
                          logoAlign,
                          logoSize,
                          coverEnabled,
                          layoutFormat,
                          tone,
                          lengthPreset,
                        });
                        if (saved.error) {
                          setError(saved.error);
                          return;
                        }
                      }
                      const result = await issueStudioDocumentAction({
                        documentId: document.id,
                        sections: isEditable ? sections : undefined,
                        reviewedContentConfirmed: confirmReview || document.sensitivity !== "clinical",
                        purposeAdequacyConfirmed: purposeOk || document.sensitivity !== "clinical",
                        technicalFoundationConfirmed: foundationOk,
                        compatibleAssessmentConfirmed: assessmentOk,
                        previewChecked: previewOk,
                      });
                      if (result.error) setError(result.error);
                      else router.refresh();
                    })
                  }
                >
                  Emitir PDF
                </Button>
              </div>
            </div>
          ) : null}

          {file ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <DocumentDownloadButton documentVersionId={file.document_version_id} />
            </div>
          ) : null}

          {document.status === "issued" ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Confirmação eletrônica
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{INTERNAL_SIGNATURE_DISCLAIMER}</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  id="confirm-document-review"
                  type="checkbox"
                  className="mt-1"
                  checked={confirmReview}
                  onChange={(event) => setConfirmReview(event.target.checked)}
                />
                Confirmo que revisei este documento e autorizo sua emissão.
              </label>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={!confirmReview}
                isLoading={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await signDocumentAction({
                      documentId: document.id,
                      confirmationAcknowledged: true,
                    });
                    if (result.error) setError(result.error);
                    else {
                      setSuccess("Emissão confirmada eletronicamente no VirgíniaPsi.");
                      router.refresh();
                    }
                  })
                }
              >
                Confirmar emissão
              </Button>
            </div>
          ) : null}

          {signature ? (
            <dl className="rounded-3xl border border-border bg-card p-5 text-xs">
              <dt className="font-semibold">Hash SHA-256</dt>
              <dd className="font-mono break-all">{signature.document_sha256}</dd>
            </dl>
          ) : null}

          {document.status === "issued" ||
          document.status === "signed" ||
          document.status === "externally_signed" ||
          document.status === "delivered" ? (
            <form
              className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await registerDeliveryAction({
                    documentId: document.id,
                    recipientName: delivery.recipientName,
                    deliveredAt: new Date(delivery.deliveredAt).toISOString(),
                    method: delivery.method,
                    receiptConfirmed: delivery.receiptConfirmed,
                    devolutionDone: delivery.devolutionDone,
                    notes: delivery.notes,
                  });
                  if (result.error) setError(result.error);
                  else {
                    setSuccess("Entrega registrada.");
                    router.refresh();
                  }
                });
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Registrar entrega
              </p>
              <input
                required
                placeholder="Destinatário"
                className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={delivery.recipientName}
                onChange={(event) => setDelivery((current) => ({ ...current, recipientName: event.target.value }))}
              />
              <input
                type="datetime-local"
                className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={delivery.deliveredAt}
                onChange={(event) => setDelivery((current) => ({ ...current, deliveredAt: event.target.value }))}
              />
              <select
                className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={delivery.method}
                onChange={(event) =>
                  setDelivery((current) => ({
                    ...current,
                    method: event.target.value as typeof current.method,
                  }))
                }
              >
                {DELIVERY_METHOD_VALUES.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <label className="mt-2 flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={delivery.receiptConfirmed}
                  onChange={(event) =>
                    setDelivery((current) => ({ ...current, receiptConfirmed: event.target.checked }))
                  }
                />
                Recebimento confirmado
              </label>
              <label className="mt-1 flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={delivery.devolutionDone}
                  onChange={(event) =>
                    setDelivery((current) => ({ ...current, devolutionDone: event.target.checked }))
                  }
                />
                Devolutiva realizada
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                placeholder="Observação"
                value={delivery.notes}
                onChange={(event) => setDelivery((current) => ({ ...current, notes: event.target.value }))}
              />
              <Button type="submit" size="sm" className="mt-2" isLoading={isPending}>
                Registrar entrega
              </Button>
              {deliveries.length > 0 ? (
                <ul className="mt-3 text-xs text-muted-foreground">
                  {deliveries.map((item) => (
                    <li key={item.id}>
                      {item.recipient_name} · {item.method} ·{" "}
                      {new Date(item.delivered_at).toLocaleString("pt-BR")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  const result = await duplicateDocumentAction({ documentId: document.id });
                  if (result.error || !result.id) setError(result.error ?? "Falha ao duplicar.");
                  else router.push(`/app/documents/${result.id}`);
                })
              }
            >
              Usar como base para novo documento
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  const name = window.prompt("Nome do modelo");
                  if (!name) return;
                  const result = await saveDocumentAsTemplateAction({
                    documentId: document.id,
                    name,
                    favorite: false,
                  });
                  if (result.error) setError(result.error);
                  else setSuccess("Modelo salvo na clínica.");
                })
              }
            >
              Salvar como modelo
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar documento?"
        description="O documento fica marcado como cancelado e não pode mais ser editado ou reemitido."
        confirmLabel="Cancelar documento"
        isLoading={isPending}
        onConfirm={() =>
          startTransition(async () => {
            await cancelDocumentAction(document.id);
            setConfirmCancel(false);
            router.refresh();
          })
        }
      />
    </div>
  );
}
