import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ConsentPanel } from "@/features/consents/components/consent-panel";
import { TclePanel } from "@/features/consents/components/tcle-panel";
import {
  listPatientConsents,
  resolveConsentState,
} from "@/features/consents/queries";
import { resolveMinorRequirement } from "@/features/consents/contracts";
import { PatientAttachmentsPanel } from "@/features/documents/components/patient-attachments-panel";
import { PatientDocumentsPanel } from "@/features/documents/components/patient-documents-panel";
import {
  listDocuments,
  listPatientAttachments,
  listTemplates,
} from "@/features/documents/queries";
import {
  PatientPendingBlock,
  PatientPlansBlock,
  PatientStatementBlock,
} from "@/features/finance/components/patient-finance-panels";
import { getPatientFinance } from "@/features/finance/queries";
import { ClinicalProfileForm } from "@/features/patients/components/clinical-profile-form";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import { PatientHubSection } from "@/features/patients/components/patient-hub-section";
import { PatientStatusControl } from "@/features/patients/components/patient-status-control";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import {
  getPatient,
  getPatientClinicalProfile,
  getPatientPortraitUrl,
} from "@/features/patients/queries";
import { WhatsappPanel } from "@/features/communications/components/whatsapp-panel";
import { getPatientWhatsAppSnapshot } from "@/features/communications/queries";
import { SessionHistoryList } from "@/features/sessions/components/session-history-list";
import { StartSessionButton } from "@/features/sessions/components/start-session-button";
import { listPatientSessions } from "@/features/sessions/queries";
import { centsFromCanonical, formatBRL } from "@/lib/finance/money";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export async function generateMetadata({
  params,
}: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const { organizationId } = await requireOrgContext();
  const patient = await getPatient(organizationId, patientId);
  return { title: patient ? `${patient.preferred_name} — Tesseli` : "Paciente — Tesseli" };
}

export default async function PatientHubPage({
  params,
}: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const { organizationId, role, timezone } = await requireOrgContext();

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    notFound();
  }

  const isAdmin = role === "psychologist_admin";
  // The clinical profile is only ever fetched for psychologist_admin — a
  // secretary session never issues this query, not just hides it with CSS.
  const clinicalProfile = isAdmin
    ? await getPatientClinicalProfile(patient.id)
    : null;

  const [consentResolution, consents] = isAdmin
    ? await Promise.all([
        resolveConsentState(organizationId, patient.id),
        listPatientConsents(organizationId, patient.id),
      ])
    : [null, []];

  const clinicalSessions = isAdmin ? await listPatientSessions(organizationId, patient.id) : [];

  const [documents, templates, attachments] = await Promise.all([
    listDocuments(organizationId, { patientId: patient.id }),
    listTemplates(organizationId),
    listPatientAttachments(organizationId, patient.id),
  ]);

  const minorRequirement = isAdmin ? resolveMinorRequirement(patient.birth_date) : null;
  const finance = await getPatientFinance(
    organizationId,
    role,
    patient.id,
    patient.preferred_name,
  );
  const whatsapp = await getPatientWhatsAppSnapshot(
    organizationId,
    patient.id,
    patient.phone,
  );
  const photoUrl = await getPatientPortraitUrl(patient.photo_path);

  return (
    <PageContainer>
      <PageHeader
        leading={
          <PatientAvatar name={patient.preferred_name} photoUrl={photoUrl} size="md" />
        }
        title={patient.preferred_name}
        subtitle={`${patient.public_code} — ${patient.full_name}`}
        actions={
          <>
            <PatientStatusControl patientId={patient.id} status={patient.status} />
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/patients/${patient.id}/edit`}>Editar cadastro</Link>
            </Button>
          </>
        }
      />

      <PatientHubSection title="Dados do Paciente">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Nome completo" value={patient.full_name} />
          <Field
            label="Nascimento"
            value={
              patient.birth_date
                ? new Date(`${patient.birth_date}T00:00:00`).toLocaleDateString(
                    "pt-BR",
                  )
                : "—"
            }
          />
          <Field label="Telefone" value={patient.phone ?? "—"} />
          <Field label="E-mail" value={patient.email ?? "—"} />
          <Field label="Modalidade" value={MODALITY_LABELS[patient.modality]} />
          <Field
            label="Valor padrão da sessão"
            value={
              patient.default_session_value != null
                ? formatBRL(centsFromCanonical(patient.default_session_value))
                : "—"
            }
          />
        </div>

        {patient.responsibles.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Responsáveis
            </span>
            <div className="flex flex-col gap-2">
              {patient.responsibles.map((responsible, index) => (
                <div
                  key={`${responsible.name}-${index}`}
                  className="rounded-xl border border-border bg-surface/50 px-3.5 py-2 text-sm"
                >
                  <span className="font-semibold text-foreground">
                    {responsible.name}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({responsible.relationship}) — {responsible.phone}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PatientHubSection>

      {isAdmin ? (
        <PatientHubSection
          title="Acompanhamento"
          description="Conteúdo clínico — visível apenas para a psicóloga administradora."
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/supervisor?patientId=${patient.id}`}>Supervisor Clínico IA</Link>
            </Button>
          }
        >
          <ClinicalProfileForm patientId={patient.id} profile={clinicalProfile} />
        </PatientHubSection>
      ) : null}

      {isAdmin && consentResolution ? (
        <PatientHubSection
          id="consentimentos"
          title="Consentimentos de gravação, transcrição e IA"
          description="Exigidos antes de capturar áudio ou usar apoio de IA na sessão."
        >
          <ConsentPanel
            patientId={patient.id}
            resolution={consentResolution}
            consents={consents}
          />
        </PatientHubSection>
      ) : null}

      <PatientHubSection
        title="WhatsApp"
        description="Consentimento, canal, modelos e lembretes 24h/2h. Confirmação de agenda por resposta só ocorre com SIM explícito."
      >
        <WhatsappPanel patientId={patient.id} snapshot={whatsapp} />
      </PatientHubSection>

      <PatientHubSection title="Adesão & Planos Ativos">
        <PatientPlansBlock access={finance.access} plans={finance.plans} />
      </PatientHubSection>

      <PatientHubSection title="Pendências">
        <PatientPendingBlock access={finance.access} charges={finance.charges} />
      </PatientHubSection>

      {isAdmin ? (
        <PatientHubSection
          title="Registro Histórico de Prontuário"
          description="Sessões clínicas, DPEP e transcrição — apenas psicóloga administradora."
          actions={<StartSessionButton patientId={patient.id} />}
        >
          {clinicalSessions.length > 0 ? (
            <SessionHistoryList sessions={clinicalSessions} timezone={timezone} />
          ) : (
            <EmptyState
              icon={NotebookPen}
              title="Nenhuma sessão clínica ainda"
              description="Inicie uma sessão para registrar DPEP, transcrição e apoio de IA."
            />
          )}
        </PatientHubSection>
      ) : null}

      <PatientHubSection
        title="Documentos"
        description="Laudos, atestados, recibos e outros — visibilidade por classificação administrativa/clínica."
      >
        <PatientDocumentsPanel
          patientId={patient.id}
          documents={documents}
          templates={templates}
          isAdmin={isAdmin}
        />
      </PatientHubSection>

      <PatientHubSection
        title="Anexos"
        description="Arquivos do paciente — visibilidade por classificação administrativa/clínica."
      >
        <PatientAttachmentsPanel
          patientId={patient.id}
          attachments={attachments}
          isAdmin={isAdmin}
        />
      </PatientHubSection>

      <PatientHubSection title="Extrato Financeiro">
        <PatientStatementBlock access={finance.access} charges={finance.charges} />
      </PatientHubSection>

      {isAdmin && minorRequirement ? (
        <PatientHubSection
          id="tcle"
          title="Gestão de TCLE"
          description="Aceite, revogação e histórico do Termo de Consentimento Livre e Esclarecido e dos termos de serviço."
        >
          <TclePanel
            patientId={patient.id}
            consents={consents}
            isMinor={minorRequirement.isMinor}
            requiresAssent={minorRequirement.requiresAssent}
          />
        </PatientHubSection>
      ) : null}
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
