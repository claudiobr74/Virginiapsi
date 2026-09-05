"use client";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { DocumentRow } from "@/features/documents/contracts";
import type { SystemTemplateDefinition } from "@/features/documents/system-templates";
import { finalizeChecklistState, issueBlockedByUiGuards } from "@/features/documents/studio-presentation";
import { useMemo, useState } from "react";

export function DocumentFinalizeDrawer({
  open,
  onOpenChange,
  document,
  template,
  purpose,
  recipientName,
  unresolved,
  isEditable,
  isPending,
  onSave,
  onReview,
  onIssue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentRow;
  template: SystemTemplateDefinition | null;
  purpose: string;
  recipientName: string;
  unresolved: boolean;
  isEditable: boolean;
  isPending: boolean;
  onSave: () => void;
  onReview: () => void;
  onIssue: (input: {
    previewOk: boolean;
    confirmReview: boolean;
    purposeOk: boolean;
    foundationOk: boolean;
    assessmentOk: boolean;
  }) => void;
}) {
  const [previewOk, setPreviewOk] = useState(false);
  const [confirmReview, setConfirmReview] = useState(false);
  const [purposeOk, setPurposeOk] = useState(false);
  const [foundationOk, setFoundationOk] = useState(false);
  const [assessmentOk, setAssessmentOk] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const checklist = useMemo(
    () =>
      finalizeChecklistState({
        patientId: document.patient_id,
        allowsMissingPatient: Boolean(template?.guardrails.allowsMissingPatient),
        purpose,
        purposeRequired: Boolean(template?.requiredData.includes("document.purpose")),
        recipientName,
        recipientRequired: Boolean(template?.requiredData.includes("recipient.name")),
        unresolved,
        reviewedAt: document.reviewed_at ?? null,
        previewOk,
      }),
    [document.patient_id, document.reviewed_at, previewOk, purpose, recipientName, template, unresolved],
  );

  const issueBlocked = issueBlockedByUiGuards({
    unresolved,
    previewOk,
    clinical: document.sensitivity === "clinical",
    confirmReview,
    purposeAdequacy: purposeOk,
    requiresTechnicalFoundation: Boolean(template?.guardrails.requiresTechnicalFoundation),
    foundationOk,
    requiresCompatibleAssessment: Boolean(template?.guardrails.requiresCompatibleAssessment),
    assessmentOk,
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Antes de finalizar"
        description="Revise o documento e confirme a emissão."
        tone="documents"
        className="sm:max-w-2xl"
        footer={
          <div className="flex flex-wrap gap-2">
            {isEditable ? (
              <Button type="button" variant="secondary" size="sm" isLoading={isPending} onClick={onSave}>
                Salvar rascunho
              </Button>
            ) : null}
            {isEditable ? (
              <Button type="button" variant="secondary" size="sm" onClick={onReview}>
                Registrar revisão
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              isLoading={isPending}
              disabled={issueBlocked}
              onClick={() =>
                onIssue({ previewOk, confirmReview, purposeOk, foundationOk, assessmentOk })
              }
            >
              Emitir documento
            </Button>
          </div>
        }
      >
        <ul className="space-y-2 text-sm">
          <li>{checklist.patientOk ? "Paciente identificado" : "Paciente pendente"}</li>
          <li>{checklist.purposeOk ? "Finalidade definida" : "Finalidade pendente"}</li>
          <li>{checklist.recipientOk ? "Destinatário" : "Destinatário pendente"}</li>
          <li>{checklist.placeholdersOk ? "Sem campos pendentes" : "Há campos pendentes"}</li>
          <li>{checklist.reviewedOk ? "Revisão concluída" : "Revisão pendente"}</li>
          <li>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={previewOk} onChange={(event) => setPreviewOk(event.target.checked)} />
              Documento visualizado
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

        <div className="mt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowPreview((current) => !current)}>
            Visualizar PDF
          </Button>
          {showPreview ? (
            <iframe
              title="Pré-visualização do PDF"
              src={`/app/documents/${document.id}/preview`}
              className="mt-3 h-[50vh] w-full rounded-xl border border-border bg-white"
            />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
