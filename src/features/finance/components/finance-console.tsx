"use client";

import { Banknote, Receipt, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CHARGE_ORIGIN_LABELS,
  CHARGE_ORIGIN_VALUES,
  CHARGE_STATUS_LABELS,
  CSV_COLUMN_LABELS,
  CSV_COLUMN_VALUES,
  EXPENSE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  PLAN_TYPE_VALUES,
  SECRETARY_FINANCE_ACCESS_LABELS,
  SECRETARY_FINANCE_ACCESS_VALUES,
  monthBounds,
  todayIsoDate,
  type ChargeView,
  type CsvColumn,
  type ExpenseRow,
  type FinanceSnapshot,
  type PaymentMethod,
  type PlanRow,
  type SecretaryFinanceAccess,
} from "@/features/finance/contracts";
import {
  cancelChargeAction,
  cancelExpenseAction,
  cancelPlanAction,
  closePeriodAction,
  createChargeAction,
  createExpenseAction,
  createPlanAction,
  exportFinanceCsvAction,
  issueMonthlyReceiptBatchAction,
  issueReceiptAction,
  payExpenseAction,
  registerPaymentAction,
  reopenPeriodAction,
  requestNfseAction,
  updateSecretaryFinanceAccessAction,
  voidPaymentAction,
} from "@/features/finance/actions";
import { FinanceStatCard } from "@/features/finance/components/finance-stat-card";
import {
  chargeBadgeStatus,
  expenseBadgeStatus,
  planBadgeStatus,
} from "@/features/finance/status-badge";
import { centsFromCanonical, formatBRL } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "today", label: "Hoje" },
  { id: "receivables", label: "Recebimentos" },
  { id: "expenses", label: "Despesas" },
  { id: "reports", label: "Relatórios" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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

export function FinanceConsole({
  snapshot,
  patients,
  isAdmin,
  timezone,
}: {
  snapshot: FinanceSnapshot;
  patients: { id: string; preferred_name: string }[];
  isAdmin: boolean;
  timezone: string;
}) {
  const [tab, setTab] = useState<TabId>("today");
  const today = todayIsoDate(timezone);
  const canWrite = snapshot.access === "manage";

  return (
    <div className="flex flex-col gap-6">
      {isAdmin ? (
        <SecretaryAccessCard current={snapshot.secretaryAccessSetting} />
      ) : null}

      <div
        className="flex flex-wrap gap-1 border-b border-border"
        role="tablist"
        aria-label="Subabas do financeiro"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              tab === item.id
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "today" ? (
        <TodayTab
          charges={snapshot.charges}
          payments={snapshot.payments}
          canWrite={canWrite}
          today={today}
          timezone={timezone}
        />
      ) : null}
      {tab === "receivables" ? (
        <ReceivablesTab
          charges={snapshot.charges}
          payments={snapshot.payments}
          patients={patients}
          canWrite={canWrite}
          today={today}
        />
      ) : null}
      {tab === "expenses" ? (
        <ExpensesTab expenses={snapshot.expenses} canWrite={canWrite} />
      ) : null}
      {tab === "reports" ? (
        <ReportsTab snapshot={snapshot} canWrite={canWrite} today={today} />
      ) : null}

      {canWrite ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-serif text-lg font-bold italic">Planos e pacotes</h2>
          <PlanForm patients={patients} />
          {snapshot.plans.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={Wallet}
              title="Nenhum plano ativo"
              description="Pacotes e mensalidades do paciente aparecem aqui e no hub."
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {snapshot.plans.map((plan) => (
                <PlanRowItem key={plan.id} plan={plan} canWrite={canWrite} patients={patients} />
              ))}
            </ul>
          )}
        </section>
      ) : snapshot.plans.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-serif text-lg font-bold italic">Planos e pacotes</h2>
          <ul className="flex flex-col gap-2">
            {snapshot.plans.map((plan) => (
              <PlanRowItem key={plan.id} plan={plan} canWrite={false} patients={patients} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SecretaryAccessCard({ current }: { current: SecretaryFinanceAccess }) {
  const router = useRouter();
  const [access, setAccess] = useState(current);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold italic">Acesso da secretaria</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enforcement no banco (`none` / `view` / `manage`). A interface apenas reflete a policy.
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const result = await updateSecretaryFinanceAccessAction({ access });
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setMessage("Acesso atualizado.");
            router.refresh();
          });
        }}
      >
        <Field label="Permissão financeira">
          <select
            className={selectClass}
            value={access}
            onChange={(event) => setAccess(event.target.value as SecretaryFinanceAccess)}
          >
            {SECRETARY_FINANCE_ACCESS_VALUES.map((value) => (
              <option key={value} value={value}>
                {SECRETARY_FINANCE_ACCESS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" size="sm" isLoading={isPending}>
          Salvar acesso
        </Button>
      </form>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}

function dateInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T12:00:00`);
  const to = Date.parse(`${toIsoDate}T12:00:00`);
  return Math.round((to - from) / 86_400_000);
}

function TodayTab({
  charges,
  payments,
  canWrite,
  today,
  timezone,
}: {
  charges: ChargeView[];
  payments: FinanceSnapshot["payments"];
  canWrite: boolean;
  today: string;
  timezone: string;
}) {
  const openCharges = charges.filter((charge) =>
    ["pending", "partially_paid", "overdue"].includes(charge.row.status),
  );
  const todayPayments = payments.filter(
    (payment) => !payment.voided_at && dateInTimeZone(payment.paid_at, timezone) === today,
  );
  const receivedToday = todayPayments.reduce(
    (sum, payment) => sum + centsFromCanonical(payment.amount),
    0,
  );
  const dueToday = openCharges.filter(
    (charge) => charge.row.due_date === today || charge.row.competence_date === today,
  );
  const toReceiveToday = dueToday.reduce((sum, charge) => sum + charge.remainingCents, 0);
  const pendingTotal = openCharges.reduce((sum, charge) => sum + charge.remainingCents, 0);
  const overdue = openCharges.filter(
    (charge) =>
      charge.row.status === "overdue" ||
      (charge.row.due_date != null && charge.row.due_date < today && charge.remainingCents > 0),
  );
  const upcoming = openCharges
    .filter((charge) => charge.row.due_date != null && charge.row.due_date > today)
    .sort((a, b) => (a.row.due_date ?? "").localeCompare(b.row.due_date ?? ""))
    .slice(0, 5);
  const todayList = charges.filter(
    (charge) =>
      charge.row.status !== "canceled" &&
      (charge.row.due_date === today || charge.row.competence_date === today),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStatCard
          label="Recebido hoje"
          value={formatBRL(receivedToday)}
          hint={
            todayPayments.length === 0
              ? "Nenhum pagamento registrado hoje"
              : `${todayPayments.length} pagamento(s)`
          }
          tone="success"
        />
        <FinanceStatCard
          label="A receber hoje"
          value={formatBRL(toReceiveToday)}
          hint={
            dueToday.length === 0
              ? "Sem vencimentos hoje"
              : `${dueToday.length} cobrança(s) em aberto`
          }
          tone="attention"
        />
        <FinanceStatCard
          label="Total pendente"
          value={formatBRL(pendingTotal)}
          hint="Saldo em aberto no consultório"
          tone="failed"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-serif text-lg font-bold italic">Recebimentos de hoje</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Cobranças com vencimento ou competência de hoje, com baixa rápida quando houver saldo.
          </p>
          {todayList.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Nenhuma pendência financeira hoje"
              description="Quando houver vencimentos ou atrasos, eles aparecem aqui para baixa rápida."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {todayList.map((charge) => (
                <ChargeCard key={charge.row.id} charge={charge} canWrite={canWrite} compact />
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-serif text-lg font-bold italic">Pendências</h2>
            {overdue.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma cobrança em atraso.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {overdue.map((charge) => {
                  const lateDays =
                    charge.row.due_date != null ? daysBetween(charge.row.due_date, today) : null;
                  return (
                    <li
                      key={charge.row.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {charge.patientName ?? "Sem paciente"}
                        {lateDays != null && lateDays > 0 ? (
                          <span className="mt-0.5 block text-[11px] text-failed">
                            Há {lateDays} dia{lateDays === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-failed">
                        {formatBRL(charge.remainingCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-serif text-lg font-bold italic">Próximos vencimentos</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum vencimento futuro listado.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {upcoming.map((charge) => (
                  <li
                    key={charge.row.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {charge.patientName ?? "Sem paciente"}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {charge.row.due_date}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatBRL(charge.remainingCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ReceivablesTab({
  charges,
  payments,
  patients,
  canWrite,
  today,
}: {
  charges: ChargeView[];
  payments: FinanceSnapshot["payments"];
  patients: { id: string; preferred_name: string }[];
  canWrite: boolean;
  today: string;
}) {
  const pendingCents = charges
    .filter((charge) => ["pending", "partially_paid"].includes(charge.row.status))
    .reduce((sum, charge) => sum + charge.remainingCents, 0);
  const overdueCents = charges
    .filter(
      (charge) =>
        charge.row.status === "overdue" ||
        (charge.row.due_date != null &&
          charge.row.due_date < today &&
          charge.remainingCents > 0 &&
          !["canceled", "refunded", "paid"].includes(charge.row.status)),
    )
    .reduce((sum, charge) => sum + charge.remainingCents, 0);
  const receivedCents = charges
    .filter((charge) => !["canceled", "refunded"].includes(charge.row.status))
    .reduce((sum, charge) => sum + charge.paidCents, 0);
  const receivedCount = payments.filter((payment) => !payment.voided_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStatCard
          label="Recebido"
          value={formatBRL(receivedCents)}
          hint={`${receivedCount} pagamento(s) registrados`}
          tone="success"
        />
        <FinanceStatCard
          label="Faturamentos pendentes"
          value={formatBRL(pendingCents)}
          hint="Aguardando baixa"
          tone="attention"
        />
        <FinanceStatCard
          label="Total atrasado"
          value={formatBRL(overdueCents)}
          hint="Cobranças não pagas no prazo"
          tone="failed"
        />
      </div>
      {canWrite ? <ChargeForm patients={patients} today={today} /> : null}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-serif text-lg font-bold italic">Cobranças</h2>
        {charges.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma cobrança ainda"
            description="Lance uma sessão avulsa, pacote, mensalidade ou movimento administrativo."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {charges.map((charge) => (
              <ChargeCard
                key={charge.row.id}
                charge={charge}
                canWrite={canWrite}
                payments={payments.filter((payment) => payment.charge_id === charge.row.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChargeForm({
  patients,
  today,
}: {
  patients: { id: string; preferred_name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 font-serif text-lg font-bold italic">Nova cobrança</h2>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          setError(null);
          startTransition(async () => {
            const result = await createChargeAction({
              patientId: String(form.get("patientId") ?? ""),
              origin: String(form.get("origin")),
              description: String(form.get("description") ?? ""),
              amount: String(form.get("amount") ?? ""),
              dueDate: String(form.get("dueDate") ?? ""),
              competenceDate: String(form.get("competenceDate") ?? ""),
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            formElement.reset();
            router.refresh();
          });
        }}
      >
        <Field label="Paciente">
          <select name="patientId" className={selectClass} defaultValue="">
            <option value="">Sem paciente vinculado</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.preferred_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Origem">
          <select name="origin" className={selectClass} defaultValue="administrative">
            {CHARGE_ORIGIN_VALUES.map((origin) => (
              <option key={origin} value={origin}>
                {CHARGE_ORIGIN_LABELS[origin]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descrição">
          <Input name="description" required maxLength={300} placeholder="Sessão avulsa, pacote…" />
        </Field>
        <Field label="Valor">
          <Input name="amount" required inputMode="decimal" placeholder="150,00" />
        </Field>
        <Field label="Vencimento">
          <Input name="dueDate" type="date" defaultValue={today} />
        </Field>
        <Field label="Competência">
          <Input name="competenceDate" type="date" required defaultValue={today} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" isLoading={isPending}>
            Lançar cobrança
          </Button>
        </div>
        {error ? (
          <p role="alert" className="sm:col-span-2 text-sm text-failed">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function ChargeCard({
  charge,
  canWrite,
  compact = false,
  payments = [],
}: {
  charge: ChargeView;
  canWrite: boolean;
  compact?: boolean;
  payments?: FinanceSnapshot["payments"];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const late = charge.row.due_date != null && charge.row.due_date < todayIsoDate() && charge.remainingCents > 0;

  function run(action: () => Promise<{ error?: string; warning?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{charge.row.description}</p>
          <p className="text-sm text-muted-foreground">
            {charge.patientName ?? "Sem paciente"} · {CHARGE_ORIGIN_LABELS[charge.row.origin]}
            {charge.row.due_date ? ` · vence ${charge.row.due_date}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="tabular-nums text-base font-semibold">{formatBRL(charge.amountCents)}</p>
          <StatusBadge
            status={chargeBadgeStatus(charge.row.status)}
            label={CHARGE_STATUS_LABELS[charge.row.status]}
          />
          {late && charge.row.status === "partially_paid" ? (
            <span className="text-xs font-semibold text-failed">em atraso</span>
          ) : null}
        </div>
      </div>
      {charge.remainingCents > 0 && charge.row.status !== "canceled" ? (
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          Saldo {formatBRL(charge.remainingCents)}
        </p>
      ) : null}

      {canWrite && charge.remainingCents > 0 && !["canceled", "refunded"].includes(charge.row.status) ? (
        <QuickPayForm
          chargeId={charge.row.id}
          remainingLabel={formatBRL(charge.remainingCents)}
          defaultAmount={formatBRL(charge.remainingCents).replace("R$ ", "")}
        />
      ) : null}

      {canWrite && !compact ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {charge.row.status !== "canceled" && charge.row.status !== "refunded" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isLoading={isPending}
              onClick={() =>
                run(() =>
                  cancelChargeAction({
                    chargeId: charge.row.id,
                    reason: "Cancelamento operacional",
                    asRefund: charge.paidCents > 0,
                  }),
                )
              }
            >
              {charge.paidCents > 0 ? "Estornar" : "Cancelar"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={isPending}
            onClick={() => run(() => requestNfseAction(charge.row.id))}
          >
            {charge.row.nfse_requested_at ? "NFS-e solicitada" : "Solicitar NFS-e"}
          </Button>
        </div>
      ) : null}

      {!compact && payments.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={payment.voided_at ? "text-muted-foreground line-through" : ""}>
                {formatBRL(centsFromCanonical(payment.amount))}{" "}
                · {PAYMENT_METHOD_LABELS[payment.method]}
                {payment.voided_at ? " (estornado)" : ""}
              </span>
              <span className="flex gap-2">
                {!payment.voided_at && canWrite ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => issueReceiptAction(payment.id))}
                    >
                      Recibo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(() =>
                          voidPaymentAction({
                            paymentId: payment.id,
                            reason: "Estorno operacional",
                          }),
                        )
                      }
                    >
                      Estornar pagamento
                    </Button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-failed">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function QuickPayForm({
  chargeId,
  remainingLabel,
  defaultAmount,
}: {
  chargeId: string;
  remainingLabel: string;
  defaultAmount: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await registerPaymentAction({
            chargeId,
            amount: String(form.get("amount") ?? ""),
            method: String(form.get("method") ?? "pix") as PaymentMethod,
            notes: String(form.get("notes") ?? ""),
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Field label={`Baixa rápida (${remainingLabel})`}>
        <Input name="amount" required defaultValue={defaultAmount} inputMode="decimal" />
      </Field>
      <Field label="Forma">
        <select name="method" className={selectClass} defaultValue="pix">
          {PAYMENT_METHOD_VALUES.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" size="sm" isLoading={isPending}>
        Registrar pagamento
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-failed sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ExpensesTab({ expenses, canWrite }: { expenses: ExpenseRow[]; canWrite: boolean }) {
  const open = expenses.filter((expense) => expense.status !== "canceled");
  const total = open.reduce((sum, expense) => sum + centsFromCanonical(expense.amount), 0);
  const pending = open.filter((expense) => expense.status !== "paid");
  const pendingCents = pending.reduce(
    (sum, expense) => sum + centsFromCanonical(expense.amount),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStatCard
          label="Total de despesas"
          value={formatBRL(total)}
          hint={`${open.length} lançamento(s)`}
          tone="failed"
        />
        <FinanceStatCard
          label="Despesas pendentes"
          value={formatBRL(pendingCents)}
          hint={
            pending.length === 0 ? "Nada em aberto" : `${pending.length} a pagar`
          }
          tone="attention"
        />
        <FinanceStatCard
          label="Pagas"
          value={formatBRL(total - pendingCents)}
          hint="Já baixadas"
          tone="success"
        />
      </div>
      {canWrite ? <ExpenseForm /> : null}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-serif text-lg font-bold italic">Despesas</h2>
        {expenses.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhuma despesa lançada"
            description="Aluguel, material, impostos e recorrências entram aqui."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <ExpenseItem key={expense.id} expense={expense} canWrite={canWrite} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExpenseForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 font-serif text-lg font-bold italic">Nova despesa</h2>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          setError(null);
          startTransition(async () => {
            const result = await createExpenseAction({
              category: String(form.get("category") ?? ""),
              supplier: String(form.get("supplier") ?? ""),
              description: String(form.get("description") ?? ""),
              amount: String(form.get("amount") ?? ""),
              dueDate: String(form.get("dueDate") ?? ""),
              recurringMonthly: form.get("recurringMonthly") === "on",
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            formElement.reset();
            router.refresh();
          });
        }}
      >
        <Field label="Categoria">
          <Input name="category" required maxLength={80} placeholder="Aluguel, material…" />
        </Field>
        <Field label="Fornecedor">
          <Input name="supplier" maxLength={160} />
        </Field>
        <Field label="Descrição">
          <Input name="description" required maxLength={300} />
        </Field>
        <Field label="Valor">
          <Input name="amount" required inputMode="decimal" placeholder="200,00" />
        </Field>
        <Field label="Vencimento">
          <Input name="dueDate" type="date" />
        </Field>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="recurringMonthly" />
          Recorrência mensal
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" isLoading={isPending}>
            Lançar despesa
          </Button>
        </div>
        {error ? (
          <p role="alert" className="sm:col-span-2 text-sm text-failed">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function ExpenseItem({ expense, canWrite }: { expense: ExpenseRow; canWrite: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cents = centsFromCanonical(expense.amount);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
      <div>
        <p className="font-semibold">
          {expense.category} · {expense.description}
        </p>
        <p className="text-sm text-muted-foreground">
          {expense.supplier ? `${expense.supplier} · ` : ""}
          {expense.due_date ? `vence ${expense.due_date}` : "sem vencimento"}
          {expense.recurrence ? " · recorrente" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums font-semibold">{formatBRL(cents)}</span>
        <StatusBadge status={expenseBadgeStatus(expense.status)} label={EXPENSE_STATUS_LABELS[expense.status]} />
        {canWrite && expense.status !== "paid" && expense.status !== "canceled" ? (
          <Button
            type="button"
            size="sm"
            isLoading={isPending}
            onClick={() =>
              startTransition(async () => {
                await payExpenseAction(expense.id);
                router.refresh();
              })
            }
          >
            Marcar paga
          </Button>
        ) : null}
        {canWrite && expense.status !== "canceled" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isLoading={isPending}
            onClick={() =>
              startTransition(async () => {
                await cancelExpenseAction(expense.id, "Cancelamento operacional");
                router.refresh();
              })
            }
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function PlanForm({ patients }: { patients: { id: string; preferred_name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError(null);
        startTransition(async () => {
          const result = await createPlanAction({
            patientId: String(form.get("patientId") ?? ""),
            planType: String(form.get("planType")),
            totalSessions: String(form.get("totalSessions") ?? ""),
            price: String(form.get("price") ?? ""),
            validFrom: String(form.get("validFrom") ?? ""),
            validUntil: String(form.get("validUntil") ?? ""),
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          formElement.reset();
          router.refresh();
        });
      }}
    >
      <Field label="Paciente">
        <select name="patientId" required className={selectClass} defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.preferred_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tipo">
        <select name="planType" className={selectClass} defaultValue="prepaid_package">
          {PLAN_TYPE_VALUES.map((type) => (
            <option key={type} value={type}>
              {PLAN_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sessões totais">
        <Input name="totalSessions" inputMode="numeric" placeholder="8" />
      </Field>
      <Field label="Preço">
        <Input name="price" required inputMode="decimal" placeholder="1.200,00" />
      </Field>
      <Field label="Válido de">
        <Input name="validFrom" type="date" />
      </Field>
      <Field label="Válido até">
        <Input name="validUntil" type="date" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" isLoading={isPending}>
          Criar plano
        </Button>
      </div>
      {error ? (
        <p role="alert" className="sm:col-span-2 text-sm text-failed">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function PlanRowItem({
  plan,
  canWrite,
  patients,
}: {
  plan: PlanRow;
  canWrite: boolean;
  patients: { id: string; preferred_name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const remaining =
    plan.total_sessions == null ? null : Math.max(plan.total_sessions - plan.used_sessions, 0);
  const patientName = patients.find((patient) => patient.id === plan.patient_id)?.preferred_name ?? "Paciente";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
      <div>
        <p className="font-semibold">
          {patientName} · {PLAN_TYPE_LABELS[plan.plan_type]}
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {plan.used_sessions} usadas
          {plan.total_sessions != null ? ` / ${plan.total_sessions}` : ""}
          {remaining != null ? ` · ${remaining} restantes` : ""}
          {plan.valid_until ? ` · até ${plan.valid_until}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums font-semibold">
          {formatBRL(centsFromCanonical(plan.price))}
        </span>
        <StatusBadge status={planBadgeStatus(plan.status)} label={PLAN_STATUS_LABELS[plan.status]} />
        {canWrite && plan.status === "active" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isLoading={isPending}
            onClick={() =>
              startTransition(async () => {
                await cancelPlanAction(plan.id, "Cancelamento operacional");
                router.refresh();
              })
            }
          >
            Cancelar plano
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ReportsTab({
  snapshot,
  canWrite,
  today,
}: {
  snapshot: FinanceSnapshot;
  canWrite: boolean;
  today: string;
}) {
  const bounds = monthBounds(today);
  const inMonth = (date: string | null) => Boolean(date && date >= bounds.start && date <= bounds.end);
  const billed = snapshot.charges
    .filter((charge) => !["canceled", "refunded"].includes(charge.row.status) && inMonth(charge.row.competence_date))
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const received = snapshot.charges
    .filter((charge) => inMonth(charge.row.competence_date))
    .reduce((sum, charge) => sum + charge.paidCents, 0);
  const expenses = snapshot.expenses
    .filter((expense) => expense.status !== "canceled" && inMonth(expense.due_date ?? expense.created_at.slice(0, 10)))
    .reduce((sum, expense) => sum + centsFromCanonical(expense.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceStatCard label="Faturado no mês" value={formatBRL(billed)} />
        <FinanceStatCard label="Recebido no mês" value={formatBRL(received)} tone="success" />
        <FinanceStatCard label="Despesas no mês" value={formatBRL(expenses)} tone="failed" />
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-1 font-serif text-lg font-bold italic">Resultado</h2>
        <p className="tabular-nums text-2xl font-semibold">{formatBRL(received - expenses)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Competência {bounds.start} a {bounds.end}. Caixa e competência são exportáveis em CSV.
        </p>
      </section>
      <CsvExportForm bounds={bounds} />
      {canWrite ? <ClosingForm bounds={bounds} closings={snapshot.closings} /> : null}
      {canWrite ? <BatchReceiptButton /> : null}
    </div>
  );
}

function CsvExportForm({ bounds }: { bounds: { start: string; end: string } }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<CsvColumn[]>([...CSV_COLUMN_VALUES]);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 font-serif text-lg font-bold italic">Exportação contábil (CSV)</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await exportFinanceCsvAction({
              periodStart: String(form.get("periodStart")),
              periodEnd: String(form.get("periodEnd")),
              mode: String(form.get("mode")),
              columns,
            });
            if (result.error || !result.csv) {
              setError(result.error ?? "Não foi possível exportar.");
              return;
            }
            const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `tesseli-financeiro-${form.get("periodStart")}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="De">
            <Input name="periodStart" type="date" required defaultValue={bounds.start} />
          </Field>
          <Field label="Até">
            <Input name="periodEnd" type="date" required defaultValue={bounds.end} />
          </Field>
          <Field label="Base">
            <select name="mode" className={selectClass} defaultValue="competence">
              <option value="competence">Competência</option>
              <option value="cash">Caixa</option>
            </select>
          </Field>
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Colunas
          </legend>
          {CSV_COLUMN_VALUES.map((column) => (
            <label key={column} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={columns.includes(column)}
                onChange={() =>
                  setColumns((current) =>
                    current.includes(column)
                      ? current.filter((item) => item !== column)
                      : [...current, column],
                  )
                }
              />
              {CSV_COLUMN_LABELS[column]}
            </label>
          ))}
        </fieldset>
        <Button type="submit" size="sm" isLoading={isPending} disabled={columns.length === 0}>
          Baixar CSV
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-failed">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function ClosingForm({
  bounds,
  closings,
}: {
  bounds: { start: string; end: string };
  closings: FinanceSnapshot["closings"];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 font-serif text-lg font-bold italic">Fechamento mensal</h2>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await closePeriodAction({
              periodStart: String(form.get("periodStart")),
              periodEnd: String(form.get("periodEnd")),
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <Field label="Início">
          <Input name="periodStart" type="date" required defaultValue={bounds.start} />
        </Field>
        <Field label="Fim">
          <Input name="periodEnd" type="date" required defaultValue={bounds.end} />
        </Field>
        <Button type="submit" size="sm" isLoading={isPending}>
          Fechar período
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {closings.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {closings.map((closing) => (
            <li
              key={closing.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm"
            >
              <span>
                {closing.period_start} a {closing.period_end} ·{" "}
                {closing.status === "closed" ? "fechado" : "reaberto"}
              </span>
              {closing.status === "closed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  isLoading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await reopenPeriodAction(closing.id);
                      router.refresh();
                    })
                  }
                >
                  Reabrir
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BatchReceiptButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-2 font-serif text-lg font-bold italic">Recibos em lote</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Emite um documento administrativo com os pagamentos do mês corrente.
      </p>
      <Button
        type="button"
        size="sm"
        isLoading={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await issueMonthlyReceiptBatchAction();
            setMessage(result.error ?? (result.id ? "Lote emitido em Documentos." : null));
            if (!result.error) router.refresh();
          })
        }
      >
        Emitir lote do mês
      </Button>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
