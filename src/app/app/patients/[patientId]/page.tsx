import {
  Banknote,
  CalendarClock,
  FileText,
  NotebookPen,
  ScrollText,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ConsentPanel } from "@/features/consents/components/consent-panel";
import {
  listPatientConsents,
  resolveConsentState,
} from "@/features/consents/queries";
import { ClinicalProfileForm } from "@/features/patients/components/clinical-profile-form";
import { PatientHubSection } from "@/features/patients/components/patient-hub-section";
import { PatientStatusControl } from "@/features/patients/components/patient-status-control";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import {
  getPatient,
  getPatientClinicalProfile,
} from "@/features/patients/queries";
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
  const { organizationId, role } = await requireOrgContext();

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

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
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
                ? `R$ ${Number(patient.default_session_value).toFixed(2)}`
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
        >
          <ClinicalProfileForm patientId={patient.id} profile={clinicalProfile} />
        </PatientHubSection>
      ) : null}

      {isAdmin && consentResolution ? (
        <PatientHubSection
          title="Consentimentos de gravação, transcrição e IA"
          description="Base mínima exigida antes de qualquer captura de áudio (Fase 5.5). O TCLE completo chega na Fase 9."
        >
          <ConsentPanel
            patientId={patient.id}
            resolution={consentResolution}
            consents={consents}
          />
        </PatientHubSection>
      ) : null}

      <PatientHubSection title="Adesão & Planos Ativos">
        <EmptyState
          icon={Banknote}
          title="Planos e pacotes chegam na Fase 10"
          description="Cobranças, pagamentos e planos de sessões serão exibidos aqui."
        />
      </PatientHubSection>

      <PatientHubSection title="Pendências">
        <EmptyState
          icon={CalendarClock}
          title="Pendências financeiras chegam na Fase 10"
          description="Cobranças em aberto e itens administrativos do paciente aparecerão aqui."
        />
      </PatientHubSection>

      <PatientHubSection title="Registro Histórico de Prontuário">
        <EmptyState
          icon={NotebookPen}
          title="Prontuário chega na Fase 6"
          description="O histórico de sessões clínicas (DPEP) será exibido aqui."
        />
      </PatientHubSection>

      <PatientHubSection title="Documentos">
        <EmptyState
          icon={FileText}
          title="Documentos chegam na Fase 9"
          description="Templates, versões e PDFs assinados aparecerão aqui."
        />
      </PatientHubSection>

      <PatientHubSection title="Extrato Financeiro">
        <EmptyState
          icon={Banknote}
          title="Extrato financeiro chega na Fase 10"
          description="Cobranças, recebimentos e recibos por paciente aparecerão aqui."
        />
      </PatientHubSection>

      <PatientHubSection title="Gestão de TCLE">
        <EmptyState
          icon={ScrollText}
          title="TCLE chega na Fase 9"
          description="Emissão, aceite e histórico de consentimento aparecerão aqui."
        />
      </PatientHubSection>
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
