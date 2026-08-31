"use client";

import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Download,
  MessageCircle,
  Mic,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectionPanel } from "@/features/calendar/components/connection-panel";
import type { ConnectionRow } from "@/features/calendar/contracts";
import { SECRETARY_FINANCE_ACCESS_LABELS } from "@/features/finance/contracts";
import { ROLE_LABELS } from "@/features/organizations/labels";
import {
  createExportDownloadUrlAction,
  confirmEliminationAction,
  inviteMemberAction,
  previewEliminationAction,
  requestLogicalExportAction,
  setMemberActiveAction,
  updateAppearanceAction,
  updateClinicAction,
  updateProfileAction,
  updateRetentionAction,
  updateSecurityAction,
} from "@/features/settings/actions";
import type { SettingsSnapshot } from "@/features/settings/contracts";
import type { IntegrationHealth } from "@/features/settings/diagnostics";
import { expectedEliminationPhrase } from "@/features/settings/elimination";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "profile", label: "Meu Perfil" },
  { id: "clinic", label: "Consultório" },
  { id: "appearance", label: "Aparência" },
  { id: "security", label: "Segurança" },
  { id: "team", label: "Equipe e Acessos" },
  { id: "integrations", label: "Integrações" },
  { id: "backup", label: "Backup e Recuperação" },
  { id: "risk", label: "Zona de Risco", tone: "danger" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const INTEGRATION_ICONS = {
  google: CalendarDays,
  twilio: MessageCircle,
  transcription: Mic,
  gemini: Sparkles,
} as const;

const selectClass =
  "h-11 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-foreground";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-deep-neutral">
        {label}
      </span>
      {children}
    </label>
  );
}

function Message({ value }: { value: string | null }) {
  if (!value) return null;
  const failed = /não|falh|inválid|confere|expir/i.test(value);
  return (
    <p
      role={failed ? "alert" : "status"}
      className={
        failed
          ? "text-sm text-failed"
          : "text-sm text-muted-foreground"
      }
    >
      {value}
    </p>
  );
}

function healthBadge(health: IntegrationHealth): {
  status: "active" | "attention" | "failed" | "pending";
  label: string;
} {
  if (health === "ok") return { status: "active", label: "Operacional" };
  if (health === "error") return { status: "failed", label: "Erro" };
  if (health === "missing") return { status: "pending", label: "Não provisionado" };
  return { status: "attention", label: "Atenção" };
}

export function SettingsConsole({
  snapshot,
  googleConnection = null,
  initialTab,
}: {
  snapshot: SettingsSnapshot;
  googleConnection?: ConnectionRow | null;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<TabId>(
    TABS.some((item) => item.id === initialTab) ? (initialTab as TabId) : "profile",
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(14rem,16.25rem)_minmax(0,1fr)] lg:items-start">
      <div
        className="flex gap-1 overflow-x-auto rounded-3xl border border-border bg-card p-2 shadow-sm [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:p-4 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Seções de configurações"
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          const danger = "tone" in item && item.tone === "danger";
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm transition-colors lg:w-full",
                selected
                  ? "bg-sage-light font-semibold text-sage-700"
                  : danger
                    ? "font-medium text-failed hover:bg-failed-bg"
                    : "font-medium text-foreground hover:bg-surface",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        {tab === "profile" ? <ProfileSection snapshot={snapshot} /> : null}
        {tab === "clinic" ? <ClinicSection snapshot={snapshot} /> : null}
        {tab === "appearance" ? <AppearanceSection snapshot={snapshot} /> : null}
        {tab === "security" ? <SecuritySection snapshot={snapshot} /> : null}
        {tab === "team" ? <TeamSection snapshot={snapshot} /> : null}
        {tab === "integrations" ? (
          <IntegrationsSection
            snapshot={snapshot}
            googleConnection={googleConnection}
          />
        ) : null}
        {tab === "backup" ? <BackupSection snapshot={snapshot} /> : null}
        {tab === "risk" ? <RiskSection snapshot={snapshot} /> : null}
      </div>
    </div>
  );
}

function ProfileSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Meu Perfil"
        description="Nome de exibição da profissional autenticada. A senha é alterada pelo fluxo de recuperação."
      />
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage(null);
          startTransition(async () => {
            const result = await updateProfileAction({
              fullName: String(form.get("fullName") ?? ""),
            });
            setMessage(result.error ?? "Perfil atualizado.");
            if (!result.error) router.refresh();
          });
        }}
      >
        <Field label="E-mail">
          <Input value={snapshot.profile.email} readOnly />
        </Field>
        <Field label="Nome de exibição">
          <Input
            id="fullName"
            name="fullName"
            defaultValue={snapshot.profile.fullName}
            required
            maxLength={160}
          />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-end">
          <Message value={message} />
          <Button type="submit" isLoading={isPending} className="self-start sm:self-auto">
            Salvar perfil
          </Button>
        </div>
      </form>
    </section>
  );
}

function ClinicSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const p = snapshot.practice;

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Consultório"
        description="Identidade profissional, duração padrão de sessão e dados fiscais administrativos."
      />
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage(null);
          startTransition(async () => {
            const result = await updateClinicAction({
              organizationName: String(form.get("organizationName") ?? ""),
              timezone: String(form.get("timezone") ?? ""),
              professionalName: String(form.get("professionalName") ?? ""),
              subtitle: String(form.get("subtitle") ?? ""),
              crp: String(form.get("crp") ?? ""),
              taxId: String(form.get("taxId") ?? ""),
              pixKey: String(form.get("pixKey") ?? ""),
              clinicName: String(form.get("clinicName") ?? ""),
              companyName: String(form.get("companyName") ?? ""),
              sessionDurationMinutes: Number(form.get("sessionDurationMinutes")),
              monthlyGoal: String(form.get("monthlyGoal") ?? ""),
            });
            setMessage(result.error ?? "Consultório atualizado.");
            if (!result.error) router.refresh();
          });
        }}
      >
        <Field label="Nome do consultório">
          <Input name="organizationName" defaultValue={snapshot.organization.name} required />
        </Field>
        <Field label="Fuso horário">
          <Input name="timezone" defaultValue={snapshot.organization.timezone} required />
        </Field>
        <Field label="Nome profissional">
          <Input name="professionalName" defaultValue={p.professional_name ?? ""} />
        </Field>
        <Field label="Subtítulo">
          <Input name="subtitle" defaultValue={p.subtitle ?? ""} />
        </Field>
        <Field label="CRP">
          <Input name="crp" defaultValue={p.crp ?? ""} />
        </Field>
        <Field label="CPF/CNPJ">
          <Input name="taxId" defaultValue={p.tax_id ?? ""} />
        </Field>
        <Field label="Chave Pix">
          <Input name="pixKey" defaultValue={p.pix_key ?? ""} />
        </Field>
        <Field label="Nome da clínica">
          <Input name="clinicName" defaultValue={p.clinic_name ?? ""} />
        </Field>
        <Field label="Razão social">
          <Input name="companyName" defaultValue={p.company_name ?? ""} />
        </Field>
        <Field label="Duração padrão (minutos)">
          <Input
            name="sessionDurationMinutes"
            type="number"
            min={10}
            max={480}
            defaultValue={p.session_duration_minutes}
          />
        </Field>
        <Field label="Meta mensal (R$)">
          <Input name="monthlyGoal" defaultValue={p.monthly_goal == null ? "" : String(p.monthly_goal)} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" isLoading={isPending}>
            Salvar consultório
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Message value={message} />
        </div>
      </form>
    </section>
  );
}

function AppearanceSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Aparência"
        description="Saudação do Início, citação e tema claro/escuro neste dispositivo."
      />
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Tema deste dispositivo</p>
          <p className="text-xs text-muted-foreground">Não é compartilhado com a equipe.</p>
        </div>
        <ThemeToggle />
      </div>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage(null);
          startTransition(async () => {
            const result = await updateAppearanceAction({
              greetingPrefix: String(form.get("greetingPrefix") ?? ""),
              quote: String(form.get("quote") ?? ""),
            });
            setMessage(result.error ?? "Aparência atualizada.");
            if (!result.error) router.refresh();
          });
        }}
      >
        <Field label="Prefixo da saudação">
          <Input
            name="greetingPrefix"
            defaultValue={snapshot.practice.greeting_prefix ?? ""}
            placeholder="Olá"
          />
        </Field>
        <Field label="Citação">
          <Input name="quote" defaultValue={snapshot.practice.quote ?? ""} />
        </Field>
        <Button type="submit" isLoading={isPending} className="self-start">
          Salvar aparência
        </Button>
        <Message value={message} />
      </form>
    </section>
  );
}

function SecuritySection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Segurança"
        description="Bloqueio por inatividade e permissão financeira da secretaria (enforcement no banco)."
      />
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage(null);
          startTransition(async () => {
            const result = await updateSecurityAction({
              inactivityTimeoutMinutes: Number(form.get("inactivityTimeoutMinutes")),
              secretaryFinanceAccess: String(form.get("secretaryFinanceAccess")),
            });
            setMessage(result.error ?? "Segurança atualizada.");
            if (!result.error) router.refresh();
          });
        }}
      >
        <Field label="Bloqueio por inatividade (minutos)">
          <Input
            name="inactivityTimeoutMinutes"
            type="number"
            min={1}
            max={240}
            defaultValue={snapshot.practice.inactivity_timeout_minutes}
          />
        </Field>
        <Field label="Acesso financeiro da secretaria">
          <select
            name="secretaryFinanceAccess"
            className={selectClass}
            defaultValue={snapshot.practice.secretary_finance_access}
          >
            {Object.entries(SECRETARY_FINANCE_ACCESS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-sm text-muted-foreground">
          Para alterar a senha, use “Esqueci minha senha” na tela de login — o VirgíniaPsi nunca pede a senha atual nesta página.
        </p>
        <Button type="submit" isLoading={isPending} className="self-start">
          Salvar segurança
        </Button>
        <Message value={message} />
      </form>
    </section>
  );
}

function TeamSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Equipe e Acessos"
        description="Convite por e-mail exige conta já cadastrada. O último admin ativo não pode ser removido."
      />
      <ul className="mt-4 flex flex-col gap-3">
        {snapshot.team.map((member) => (
          <li
            key={member.id}
            className="flex flex-col gap-2 rounded-2xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold">{member.email ?? member.user_id}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[member.role]} · {member.active ? "Ativo" : "Inativo"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={isPending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await setMemberActiveAction({
                    memberId: member.id,
                    active: !member.active,
                  });
                  setMessage(result.error ?? (member.active ? "Membro desativado." : "Membro reativado."));
                  if (!result.error) router.refresh();
                });
              }}
            >
              {member.active ? "Desativar" : "Reativar"}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage(null);
          startTransition(async () => {
            const result = await inviteMemberAction({
              email: String(form.get("email") ?? ""),
              role: String(form.get("role") ?? "secretary"),
            });
            setMessage(result.error ?? "Convite enviado.");
            if (!result.error) {
              router.refresh();
              event.currentTarget.reset();
            }
          });
        }}
      >
        <Field label="E-mail">
          <Input name="email" type="email" required placeholder="pessoa@consultorio.test" />
        </Field>
        <Field label="Papel">
          <select name="role" className={selectClass} defaultValue="secretary">
            <option value="secretary">Secretaria</option>
            <option value="psychologist">Psicóloga clínica</option>
            <option value="psychologist_admin">Administradora</option>
          </select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" isLoading={isPending}>
            Convidar
          </Button>
        </div>
      </form>
      <div className="mt-3">
        <Message value={message} />
      </div>
    </section>
  );
}

function IntegrationsSection({
  snapshot,
  googleConnection,
}: {
  snapshot: SettingsSnapshot;
  googleConnection: ConnectionRow | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showTechnical, setShowTechnical] = useState(false);
  const connection = googleConnection ?? snapshot.googleConnection;

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <SectionHeader
        title="Integrações"
        description="Status real, sem revelar chaves, tokens ou identificadores secretos."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={isPending}
            onClick={() => {
              setShowTechnical(true);
              startTransition(() => router.refresh());
            }}
          >
            Diagnosticar
          </Button>
        }
      />
      <div className="mt-4 flex flex-col gap-3">
        <ConnectionPanel
          connection={connection}
          canManage
          oauthReturnTo="settings"
          framed={false}
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {snapshot.diagnostics.integrations
            .filter((item) => showTechnical || item.key !== "google")
            .map((item) => {
              const badge = healthBadge(item.health);
              const Icon = INTEGRATION_ICONS[item.key];
              return (
                <li key={item.key} className="rounded-2xl border border-border px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-sage-light/40 text-primary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <h3 className="font-semibold">{item.label}</h3>
                    </div>
                    <StatusBadge status={badge.status} label={badge.label} />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
                  {item.lastSuccessAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Último sucesso: {new Date(item.lastSuccessAt).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                  {item.lastError ? (
                    <p className="mt-1 text-xs text-failed">{item.lastError}</p>
                  ) : null}
                </li>
              );
            })}
        </ul>
      </div>
    </section>
  );
}

function BackupSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(snapshot.patients[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <SectionHeader
          title="Backup da plataforma"
          description="A recuperação de desastre é o backup do projeto Supabase (PITR/backups gerenciados). O VirgíniaPsi não implementa DR próprio e não usa Google Drive."
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Operadores configuram retenção e restauração no painel Supabase. A exportação abaixo é portabilidade lógica, não substituto de backup.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <SectionHeader
          title="Exportação lógica VirgíniaPsi"
          description="Pacote ZIP versionado (manifest.json + JSON/CSV + hashes SHA-256), gerado neste servidor e baixado por URL assinada de curta duração."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            isLoading={isPending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await requestLogicalExportAction({ scope: "organization" });
                setMessage(result.error ?? "Exportação da organização pronta.");
                if (!result.error) router.refresh();
              });
            }}
          >
            Exportar organização
          </Button>
        </div>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await requestLogicalExportAction({
                scope: "patient",
                patientId,
              });
              setMessage(result.error ?? "Exportação do paciente pronta.");
              if (!result.error) router.refresh();
            });
          }}
        >
          <Field label="Paciente">
            <select
              className={selectClass}
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            >
              {snapshot.patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.preferred_name} · {patient.public_code}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary" isLoading={isPending}>
            Exportar paciente
          </Button>
        </form>
        <Message value={message} />

        {snapshot.exports.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Archive}
              title="Nenhuma exportação ainda"
              description="Gere um pacote da organização ou de um paciente para portabilidade e auditoria."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {snapshot.exports.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-2xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {item.scope === "organization" ? "Organização" : "Paciente"} · {item.schema_version}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.status}
                    {item.package_sha256 ? ` · sha256 ${item.package_sha256.slice(0, 12)}…` : ""}
                  </p>
                </div>
                {item.status === "ready" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isLoading={isPending}
                    onClick={() => {
                      setMessage(null);
                      startTransition(async () => {
                        const result = await createExportDownloadUrlAction(item.id);
                        if (result.error || !("url" in result) || !result.url) {
                          setMessage(result.error ?? "Download indisponível.");
                          return;
                        }
                        window.open(result.url, "_blank", "noopener,noreferrer");
                      });
                    }}
                  >
                    <Download className="size-4" aria-hidden />
                    Baixar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RiskSection({ snapshot }: { snapshot: SettingsSnapshot }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(snapshot.patients[0]?.id ?? "");
  const [phrase, setPhrase] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [report, setReport] = useState<{
    publicCode: string;
    eliminate: string[];
    retain: string[];
    outcome: string;
  } | null>(null);

  const selected = snapshot.patients.find((patient) => patient.id === patientId);

  return (
    <section className="rounded-3xl border border-failed/30 bg-card p-5">
      <SectionHeader
        title="Zona de Risco"
        description="Eliminação LGPD de identificadores administrativos. Prontuário, financeiro e consentimentos são retidos quando a norma exige."
      />
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <SectionHeader
          title="Retenção de dados"
          description="Áudio de fallback, transcrição e guarda mínima do prontuário."
        />
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setMessage(null);
            startTransition(async () => {
              const result = await updateRetentionAction({
                sessionAudioFallbackRetentionDays: Number(
                  form.get("sessionAudioFallbackRetentionDays"),
                ),
                transcriptRetentionPolicy: String(form.get("transcriptRetentionPolicy")),
                transcriptRetentionFixedDays: form.get("transcriptRetentionFixedDays")
                  ? Number(form.get("transcriptRetentionFixedDays"))
                  : null,
                clinicalRecordMinimumRetentionYears: Number(
                  form.get("clinicalRecordMinimumRetentionYears"),
                ),
              });
              setMessage(result.error ?? "Retenção atualizada.");
              if (!result.error) router.refresh();
            });
          }}
        >
          <Field label="Áudio de fallback (dias)">
            <Input
              name="sessionAudioFallbackRetentionDays"
              type="number"
              min={1}
              max={90}
              defaultValue={snapshot.practice.session_audio_fallback_retention_days}
            />
          </Field>
          <Field label="Transcrição">
            <select
              name="transcriptRetentionPolicy"
              className={selectClass}
              defaultValue={snapshot.practice.transcript_retention_policy}
            >
              <option value="with_clinical_record">Acompanhar prontuário</option>
              <option value="fixed_days">Prazo fixo (dias)</option>
            </select>
          </Field>
          <Field label="Prazo fixo da transcrição (dias)">
            <Input
              name="transcriptRetentionFixedDays"
              type="number"
              min={1}
              defaultValue={snapshot.practice.transcript_retention_fixed_days ?? ""}
            />
          </Field>
          <Field label="Guarda mínima do prontuário (anos)">
            <Input
              name="clinicalRecordMinimumRetentionYears"
              type="number"
              min={5}
              max={50}
              defaultValue={snapshot.practice.clinical_record_minimum_retention_years}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" isLoading={isPending}>
              Salvar retenção
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Field label="Paciente">
          <select
            className={selectClass}
            value={patientId}
            onChange={(event) => {
              setPatientId(event.target.value);
              setReport(null);
              setPhrase("");
            }}
          >
            {snapshot.patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.preferred_name} · {patient.public_code}
              </option>
            ))}
          </select>
        </Field>
        <Button
          type="button"
          variant="secondary"
          isLoading={isPending}
          className="self-start"
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await previewEliminationAction({ patientId });
              if (result.error || !result.report || !result.publicCode) {
                setMessage(result.error ?? "Não foi possível gerar o relatório.");
                setReport(null);
                return;
              }
              setReport({
                publicCode: result.publicCode,
                eliminate: result.report.eliminate,
                retain: result.report.retain,
                outcome: result.report.outcome,
              });
            });
          }}
        >
          Gerar relatório de eliminação
        </Button>
      </div>

      {report ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-failed/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-failed" aria-hidden />
            Resultado previsto: {report.outcome === "eliminated" ? "eliminado" : "parcialmente eliminado"}
          </p>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Elimina</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {report.eliminate.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Retém</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {report.retain.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Field label={`Digite ${expectedEliminationPhrase(report.publicCode)}`}>
            <Input
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button
            type="button"
            variant="destructive"
            className="self-start"
            onClick={() => setConfirmOpen(true)}
          >
            Eliminar dados identificadores
          </Button>
        </div>
      ) : null}

      <Message value={message} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar eliminação permanente"
        description={
          selected
            ? `Isso anonimiza identificadores de ${selected.preferred_name} (${selected.public_code}). Não dá para desfazer o cadastro administrativo.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isLoading={isPending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await confirmEliminationAction({
              patientId,
              confirmationPhrase: phrase,
            });
            setMessage(result.error ?? "Identificadores eliminados.");
            if (!result.error) {
              setConfirmOpen(false);
              setReport(null);
              setPhrase("");
              router.refresh();
            }
          });
        }}
      />
    </section>
  );
}
