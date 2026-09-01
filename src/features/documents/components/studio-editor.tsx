"use client";

import { CheckCircle, MoreHorizontal, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalContent } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { cancelDocumentAction, signDocumentAction } from "@/features/documents/actions";
import { DocumentAiAssistant } from "@/features/documents/components/document-ai-assistant";
import { DocumentDeliveryDrawer } from "@/features/documents/components/document-delivery-drawer";
import { DocumentFinalizeDrawer } from "@/features/documents/components/document-finalize-drawer";
import { DocumentMoreMenu } from "@/features/documents/components/document-more-menu";
import { DocumentSettingsDrawer } from "@/features/documents/components/document-settings-drawer";
import { DocumentVersionDrawer } from "@/features/documents/components/document-version-drawer";
import { DocumentDownloadButton } from "@/features/documents/components/patient-documents-panel";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
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
  importScheduledEncountersAction,
  issueStudioDocumentAction,
  markDocumentReviewedAction,
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
  patientName = null,
  canSaveTemplate = false,
}: {
  document: DocumentRow;
  latestVersion: DocumentVersionRow | null;
  file: DocumentFileRow | null;
  versions: DocumentVersionRow[];
  signature?: DocumentProfessionalSignatureRow | null;
  deliveries: DocumentDeliveryRow[];
  patientName?: string | null;
  canSaveTemplate?: boolean;
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReview, setConfirmReview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [templateNameOpen, setTemplateNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [compareId, setCompareId] = useState("");
  const [menuSectionId, setMenuSectionId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState({
    recipientName: "",
    deliveredAt: new Date().toISOString().slice(0, 16),
    method: "presencial" as const,
    receiptConfirmed: false,
    devolutionDone: false,
    notes: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditable = document.status === "draft" || document.status === "under_review";
  const canIssue = isEditable || document.status === "reviewed";
  const isReady =
    document.status === "issued" ||
    document.status === "signed" ||
    document.status === "externally_signed" ||
    document.status === "delivered";
  const unresolved = sections.some(
    (section) => section.enabled && hasUnresolvedPlaceholders(`${section.title}\n${section.content}`),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div>
          <Link href="/app/documents" className="text-xs font-semibold text-primary">
            ← Documentos
          </Link>
          <h1 className="mt-1 font-serif text-xl font-bold italic text-foreground">{document.title}</h1>
          <p className="text-sm text-muted-foreground">
            {patientName ? `${patientName} · ` : ""}
            {DOCUMENT_KIND_LABELS[document.document_kind]}
            {template ? ` · ${template.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={documentStatusTone(document.status)}
            label={DOCUMENT_STATUS_LABELS[document.status]}
          />
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" ? "Salvando..." : saveState === "saved" ? "Salvo agora" : `v${document.current_version}`}
          </span>
          {isEditable ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              Ajustes
            </Button>
          ) : null}
          <DocumentMoreMenu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            canCancel={document.status !== "canceled"}
            canSaveTemplate={canSaveTemplate}
            onVersions={() => {
              setMoreOpen(false);
              setVersionsOpen(true);
            }}
            onDuplicate={() => {
              setMoreOpen(false);
              startTransition(async () => {
                const result = await duplicateDocumentAction({ documentId: document.id });
                if (result.error || !result.id) setError(result.error ?? "Falha ao duplicar.");
                else router.push(`/app/documents/${result.id}`);
              });
            }}
            onSaveTemplate={() => {
              setMoreOpen(false);
              setTemplateNameOpen(true);
            }}
            onCancel={() => {
              setMoreOpen(false);
              setConfirmCancel(true);
            }}
          />
        </div>
      </div>

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

      {isReady ? (
        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
            <CheckCircle className="size-5 text-success" aria-hidden />
            Documento pronto
          </p>
          <div className="flex flex-wrap gap-2">
            {file ? <DocumentDownloadButton documentVersionId={file.document_version_id} /> : null}
            <Button type="button" size="sm" onClick={() => setDeliveryOpen(true)}>
              Registrar entrega
            </Button>
          </div>
          {document.status === "issued" ? (
            <div className="rounded-2xl border border-border bg-surface/40 p-4">
              <p className="text-xs text-muted-foreground">{INTERNAL_SIGNATURE_DISCLAIMER}</p>
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
        </section>
      ) : (
        <>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
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
                    {isEditable ? (
                      <>
                        <button type="button" className="text-[11px]" onClick={() => setSections(moveSection(sections, section.id, "up"))}>
                          ↑
                        </button>
                        <button type="button" className="text-[11px]" onClick={() => setSections(moveSection(sections, section.id, "down"))}>
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                          aria-label="Mais opções da seção"
                          aria-expanded={menuSectionId === section.id}
                          onClick={() => setMenuSectionId((current) => (current === section.id ? null : section.id))}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {menuSectionId === section.id ? (
                    <div className="mb-2 flex flex-wrap gap-3 text-[11px]">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          disabled={!isEditable}
                          onChange={(event) => updateSection(section.id, { enabled: event.target.checked })}
                        />
                        Ativa
                      </label>
                      <label className="flex items-center gap-1">
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
                    </div>
                  ) : null}
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
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-primary">Adicionar seção</summary>
                <div className="mt-2 flex flex-wrap gap-2">
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
              </details>
            ) : null}
          </div>

          {isEditable ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAiOpen(true)}>
                <Sparkles className="size-4" aria-hidden />
                Ajudar a escrever
              </Button>
              {canIssue ? (
                <Button type="button" variant="secondary" onClick={() => setFinalizeOpen(true)}>
                  Revisar e finalizar
                </Button>
              ) : null}
            </div>
          ) : canIssue ? (
            <Button type="button" onClick={() => setFinalizeOpen(true)}>
              Revisar e finalizar
            </Button>
          ) : null}
        </>
      )}

      {signature ? (
        <dl className="rounded-3xl border border-border bg-card p-5 text-xs">
          <dt className="font-semibold">Hash SHA-256</dt>
          <dd className="font-mono break-all">{signature.document_sha256}</dd>
        </dl>
      ) : null}

      <DocumentSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        document={document}
        template={template}
        isEditable={isEditable}
        recipientName={recipientName}
        purpose={purpose}
        visualProfile={visualProfile}
        logoMode={logoMode}
        logoAlign={logoAlign}
        logoSize={logoSize}
        coverEnabled={coverEnabled}
        layoutFormat={layoutFormat}
        tone={tone}
        lengthPreset={lengthPreset}
        onRecipientName={setRecipientName}
        onPurpose={setPurpose}
        onVisualProfile={setVisualProfile}
        onLogoMode={setLogoMode}
        onLogoAlign={setLogoAlign}
        onLogoSize={setLogoSize}
        onCoverEnabled={setCoverEnabled}
        onLayoutFormat={setLayoutFormat}
        onTone={setTone}
        onLengthPreset={setLengthPreset}
        importingSchedule={isPending}
        onImportSchedule={
          document.document_kind === "contrato"
            ? () =>
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
            : undefined
        }
      />

      <DocumentAiAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        documentId={document.id}
        patientId={document.patient_id}
        interviewPrompts={template?.interviewPrompts ?? []}
        onInsert={(draft) => {
          const last = sections[sections.length - 1];
          if (!last) return;
          updateSection(last.id, { content: `${last.content}\n\n${draft}` });
        }}
        onError={setError}
        onSuccess={setSuccess}
      />

      <DocumentFinalizeDrawer
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        document={document}
        template={template}
        purpose={purpose}
        recipientName={recipientName}
        unresolved={unresolved}
        isEditable={isEditable}
        isPending={isPending}
        onSave={() => persist(sections)}
        onReview={() =>
          startTransition(async () => {
            const result = await markDocumentReviewedAction({ documentId: document.id });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
        onIssue={(input) =>
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
              reviewedContentConfirmed: input.confirmReview || document.sensitivity !== "clinical",
              purposeAdequacyConfirmed: input.purposeOk || document.sensitivity !== "clinical",
              technicalFoundationConfirmed: input.foundationOk,
              compatibleAssessmentConfirmed: input.assessmentOk,
              previewChecked: input.previewOk,
            });
            if (result.error) setError(result.error);
            else {
              setFinalizeOpen(false);
              router.refresh();
            }
          })
        }
      />

      <DocumentVersionDrawer
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        compareId={compareId}
        onCompare={setCompareId}
      />

      <DocumentDeliveryDrawer
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        delivery={delivery}
        onChange={(patch) => setDelivery((current) => ({ ...current, ...patch }))}
        deliveries={deliveries}
        isPending={isPending}
        onSubmit={() =>
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
              setDeliveryOpen(false);
              router.refresh();
            }
          })
        }
      />

      <Modal open={templateNameOpen} onOpenChange={setTemplateNameOpen}>
        <ModalContent
          title="Salvar como modelo"
          footer={
            <Button
              type="button"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  if (!templateName.trim()) return;
                  const result = await saveDocumentAsTemplateAction({
                    documentId: document.id,
                    name: templateName.trim(),
                    favorite: false,
                  });
                  if (result.error) setError(result.error);
                  else {
                    setSuccess("Modelo salvo na clínica.");
                    setTemplateNameOpen(false);
                  }
                })
              }
            >
              Salvar
            </Button>
          }
        >
          <Input
            placeholder="Nome do modelo"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar documento?"
        description="O documento fica marcado como cancelado e não pode mais ser editado ou reemitido."
        confirmLabel="Cancelar documento"
        destructive
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
