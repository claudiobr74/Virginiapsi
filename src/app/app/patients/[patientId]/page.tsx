import { CheckCircle2, NotebookPen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
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
import { PLAN_TYPE_LABELS } from "@/features/finance/contracts";
import { getPatientFinance } from "@/features/finance/queries";
import { centsFromCanonical, formatBRL } from "@/lib/finance/money";
import { ClinicalProfileForm } from "@/features/patients/components/clinical-profile-form";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import { PatientHub } from "@/features/patients/components/patient-hub";
import { parsePatientHubTab } from "@/features/patients/hub-tabs";
import { PatientHubSection } from "@/features/patients/components/patient-hub-section";
import { PatientStatusControl } from "@/features/patients/components/patient-status-control";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import {
  ageFromBirthDate,
  formatBirthDateLabel,
  formatCadastroDate,
  formatCpfDisplay,
} from "@/features/patients/display";
import {
  getPatient,
  getPatientClinicalProfile,
  getPatientPortraitUrl,
  getPatientScheduleBounds,
} from "@/features/patients/queries";
import { WhatsappPanel } from "@/features/communications/components/whatsapp-panel";
import { getPatientWhatsAppSnapshot } from "@/features/communications/queries";
import { SessionHistoryList } from "@/features/sessions/components/session-history-list";
import { StartSessionButton } from "@/features/sessions/components/start-session-button";
import { getSessionDpep, listPatientSessions } from "@/features/sessions/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";
import { formatInTimeZone } from "@/lib/utils/timezone";

export async function generateMetadata({
  params,
}: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const { organizationId } = await requireOrgContext();
  const patient = await getPatient(organizationId, patientId);
  return { title: patient ? pageTitle(patient.preferred_name) : pageTitle("Paciente") };
}

export default async function PatientHubPage({
  params,
  searchParams,
}: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const query = await searchParams;
  const requestedTab = parsePatientHubTab(
    typeof query.tab === "string" ? query.tab : undefined,
    ["overview", "record", "plan", "sessions", "documents", "finance", "consents"],
  );
  const { organizationId, role, timezone } = await requireOrgContext();

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    notFound();
  }

  const isAdmin = role === "psychologist_admin";
  const clinicalProfile = isAdmin
    ? await getPatientClinicalProfile(patient.id)
    : null;

  const [consentResolution, consents] = isAdmin
    ? await Promise.all([
        resolveConsentState(organizationId, patient.id),
        listPatientConsents(organizationId, patient.id),
      ])
    : [null, []];

  const clinicalSessions = isAdmin
    ? await listPatientSessions(organizationId, patient.id)
    : [];

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
  const schedule = await getPatientScheduleBounds(organizationId, patient.id);

  const emergency = patient.responsibles[0];
  const activePlan = finance.plans.find((plan) => plan.status === "active") ?? finance.plans[0];
  const finalized = clinicalSessions.filter((session) => session.status === "finalized");
  const lastFinalized = finalized[0];
  const lastDpep = lastFinalized ? await getSessionDpep(lastFinalized.id) : null;
  const lastSessionLabel = lastFinalized
    ? formatInTimeZone(lastFinalized.ended_at ?? lastFinalized.started_at ?? lastFinalized.created_at, timezone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
  const age = ageFromBirthDate(patient.birth_date);
  const startMonth = formatInTimeZone(patient.created_at, timezone, {
    month: "long",
    year: "numeric",
  });

  const overview = (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          {isAdmin ? (
            <PatientHubSection title="Objetivos Terapêuticos">
              {clinicalProfile?.therapy_goals?.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {clinicalProfile.therapy_goals}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum objetivo terapêutico registrado ainda.
                </p>
              )}
            </PatientHubSection>
          ) : null}
          {isAdmin ? (
            <PatientHubSection title="Última Evolução Clínica">
              {lastDpep?.evolution?.trim() ? (
                <>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {lastSessionLabel}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {lastDpep.evolution}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ainda não há evolução clínica registrada no DPEP.
                </p>
              )}
            </PatientHubSection>
          ) : null}
          <PatientHubSection title="Dados do Paciente">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Field label="Nome completo" value={patient.full_name} />
            <Field label="CPF" value={formatCpfDisplay(patient.cpf)} mono />
            <Field label="Data de nascimento" value={formatBirthDateLabel(patient.birth_date)} />
            <Field label="Telefone" value={patient.phone ?? "—"} />
            <Field label="E-mail" value={patient.email ?? "—"} />
            <Field
              label="Contato de emergência"
              value={
                emergency
                  ? `${emergency.name} (${emergency.relationship}) — ${emergency.phone}`
                  : "—"
              }
            />
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
                    <span className="font-semibold text-foreground">{responsible.name}</span>{" "}
                    <span className="text-muted-foreground">
                      ({responsible.relationship}) — {responsible.phone}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </PatientHubSection>
        </div>

        <div className="flex flex-col gap-5">
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-border bg-card p-4">
                <p className="text-[13px] text-muted-foreground">Sessões realizadas</p>
                <p className="font-serif text-[28px] font-bold text-foreground">{finalized.length}</p>
              </div>
              <div className="rounded-[16px] border border-border bg-card p-4">
                <p className="text-[13px] text-muted-foreground">Última sessão</p>
                <p className="font-serif text-lg font-bold text-foreground">{lastSessionLabel}</p>
              </div>
            </div>
          ) : null}
          <div className="rounded-[16px] border border-sage-700 bg-sage-light p-5">
            <p className="text-[13px] font-bold text-sage-700">Próxima sessão</p>
            <p className="mt-2 font-serif text-xl font-bold text-foreground">
              {schedule.nextSessionAt
                ? formatInTimeZone(schedule.nextSessionAt, timezone, {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Nenhuma sessão futura"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {MODALITY_LABELS[patient.modality]}
            </p>
          </div>
          <PatientHubSection title="Adesão & Plano">
            {activePlan && finance.access !== "none" ? (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-sage-light/40 px-2.5 py-1 text-xs font-semibold text-primary">
                    {PLAN_TYPE_LABELS[activePlan.plan_type]}
                  </span>
                  {activePlan.total_sessions != null ? (
                    <span className="text-muted-foreground">
                      {activePlan.total_sessions} sessões
                    </span>
                  ) : null}
                </div>
                {activePlan.total_sessions != null && activePlan.total_sessions > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sessões usadas</span>
                      <span className="font-semibold text-foreground">
                        {activePlan.used_sessions} de {activePlan.total_sessions}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(
                            100,
                            (activePlan.used_sessions / activePlan.total_sessions) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatBRL(centsFromCanonical(activePlan.price))}
                  </span>
                </div>
              </div>
            ) : (
              <PatientPlansBlock access={finance.access} plans={finance.plans} />
            )}
          </PatientHubSection>

          <PatientHubSection title="Pendências">
            {finance.access !== "none" &&
            finance.charges.filter((charge) =>
              ["pending", "partially_paid", "overdue"].includes(charge.row.status),
            ).length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl bg-sage-light/30 p-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p className="text-xs leading-5 text-foreground">
                  Nenhuma pendência financeira ou de documento ativa.
                </p>
              </div>
            ) : (
              <PatientPendingBlock access={finance.access} charges={finance.charges} />
            )}
          </PatientHubSection>
        </div>
      </div>

      <PatientHubSection
        title="WhatsApp"
        description="Consentimento, canal, modelos e lembretes 24h/2h. Confirmação de agenda por resposta só ocorre com SIM explícito."
      >
        <WhatsappPanel patientId={patient.id} snapshot={whatsapp} />
      </PatientHubSection>
    </div>
  );

  const recordPanel = isAdmin ? (
    <PatientHubSection
      title="Acompanhamento"
      description="Queixa, histórico e notas clínicas — visível apenas para a psicóloga administradora."
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/app/supervisor?patientId=${patient.id}`}>
            Supervisor Clínico IA
          </Link>
        </Button>
      }
    >
      <ClinicalProfileForm
        patientId={patient.id}
        profile={clinicalProfile}
        include={["chiefComplaint", "history", "generalClinicalNotes"]}
      />
    </PatientHubSection>
  ) : undefined;

  const planPanel = isAdmin ? (
    <PatientHubSection
      title="Plano Terapêutico"
      description="Objetivos, esquemas e crenças — visível apenas para a psicóloga administradora."
    >
      <ClinicalProfileForm
        patientId={patient.id}
        profile={clinicalProfile}
        include={["therapyGoals", "schemas", "coreBeliefs"]}
      />
    </PatientHubSection>
  ) : undefined;

  const sessionsPanel = (
    <PatientHubSection
      title="Registro Histórico de Prontuário"
      description="Sessões clínicas, DPEP e transcrição — apenas psicóloga administradora."
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
  );

  const documentsPanel = (
    <div className="flex flex-col gap-6">
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
    </div>
  );

  const financePanel = (
    <PatientHubSection title="Extrato Financeiro">
      <PatientStatementBlock access={finance.access} charges={finance.charges} />
    </PatientHubSection>
  );

  const consentsPanel =
    isAdmin && minorRequirement ? (
    <div className="flex flex-col gap-6">
      {consentResolution ? (
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
    </div>
  ) : null;

  return (
    <PageContainer>
      <PatientHub
        backHref="/app/patients"
        registeredAt={formatCadastroDate(patient.created_at, timezone)}
        identity={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <PatientAvatar
                name={patient.preferred_name}
                photoUrl={photoUrl}
                size="hub"
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-[28px] font-bold text-foreground">
                    {patient.preferred_name}
                  </h1>
                  <span className="font-mono text-sm text-muted-foreground">
                    {patient.public_code}
                  </span>
                  <PatientStatusControl patientId={patient.id} status={patient.status} />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Início: {startMonth}
                  <span className="mx-1.5">·</span>
                  Modalidade: {MODALITY_LABELS[patient.modality]}
                  {age != null ? (
                    <>
                      <span className="mx-1.5">·</span>
                      Idade: {age} {age === 1 ? "ano" : "anos"}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/app/patients/${patient.id}/edit`}>Editar Dados</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/app/agenda?new=1">Agendar Sessão</Link>
              </Button>
              {isAdmin ? <StartSessionButton patientId={patient.id} /> : null}
            </div>
          </div>
        }
        overview={overview}
        record={recordPanel}
        plan={planPanel}
        sessions={isAdmin ? sessionsPanel : undefined}
        documents={documentsPanel}
        finance={financePanel}
        consents={consentsPanel ?? undefined}
        initialTab={requestedTab}
      />
    </PageContainer>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
