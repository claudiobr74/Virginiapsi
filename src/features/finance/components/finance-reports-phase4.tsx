"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinanceStatCard } from "@/features/finance/components/finance-stat-card";
import {
  CSV_COLUMN_LABELS,
  CSV_COLUMN_VALUES,
  monthBounds,
  type CsvColumn,
  type FinanceSnapshot,
} from "@/features/finance/contracts";
import {
  closeFinancialPeriodV2Action,
  exportFinanceCsvV2Action,
} from "@/features/finance/phase4-actions";
import { reopenPeriodWithReasonAction } from "@/features/finance/phase2-actions";
import { centsFromCanonical, formatBRL } from "@/lib/finance/money";

type FinanceScope = "competence" | "cash";

const selectClass =
  "h-11 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-foreground";

function dateInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function scopeFromClosing(closing: FinanceSnapshot["closings"][number]): FinanceScope {
  const value = closing.totals_snapshot?.scope;
  return value === "cash" ? "cash" : "competence";
}

function askReason(message: string): string | null {
  const value = window.prompt(message)?.trim() ?? "";
  if (!value) return null;
  if (value.length < 3) {
    window.alert("Informe um motivo com pelo menos 3 caracteres.");
    return null;
  }
  if (value.length > 300) {
    window.alert("O motivo deve ter no máximo 300 caracteres.");
    return null;
  }
  return value;
}

export function FinanceReportsPhase4({
  snapshot,
  today,
  timezone,
  canWrite,
}: {
  snapshot: FinanceSnapshot;
  today: string;
  timezone: string;
  canWrite: boolean;
}) {
  const bounds = monthBounds(today);
  const inMonth = (date: string | null) =>
    Boolean(date && date >= bounds.start && date <= bounds.end);

  const competence = useMemo(() => {
    const billed = snapshot.charges
      .filter(
        (charge) =>
          !["canceled", "refunded"].includes(charge.row.status) &&
          inMonth(charge.row.competence_date),
      )
      .reduce((sum, charge) => sum + charge.amountCents, 0);
    const expenses = snapshot.expenses
      .filter(
        (expense) =>
          expense.status !== "canceled" &&
          inMonth(expense.due_date ?? expense.created_at.slice(0, 10)),
      )
      .reduce((sum, expense) => sum + centsFromCanonical(expense.amount), 0);
    return { billed, expenses, result: billed - expenses };
  }, [snapshot.charges, snapshot.expenses, bounds.start, bounds.end]);

  const cash = useMemo(() => {
    const received = snapshot.payments
      .filter(
        (payment) =>
          !payment.voided_at &&
          inMonth(dateInTimeZone(payment.paid_at, timezone)),
      )
      .reduce((sum, payment) => sum + centsFromCanonical(payment.amount), 0);
    const expenses = snapshot.expenses
      .filter(
        (expense) =>
          expense.status === "paid" &&
          expense.paid_at &&
          inMonth(dateInTimeZone(expense.paid_at, timezone)),
      )
      .reduce((sum, expense) => sum + centsFromCanonical(expense.amount), 0);
    return { received, expenses, result: received - expenses };
  }, [snapshot.payments, snapshot.expenses, bounds.start, bounds.end, timezone]);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="finance-phase4-title">
      <div>
        <h2 id="finance-phase4-title" className="font-serif text-xl font-bold italic">
          Relatórios — caixa × competência
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Competência mostra o que foi produzido/faturado. Caixa mostra apenas dinheiro efetivamente recebido ou pago.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[20px] border border-tone-finance-border bg-tone-finance p-5 shadow-card">
          <h3 className="font-serif text-lg font-bold italic">Competência</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {bounds.start} a {bounds.end}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FinanceStatCard label="Faturado" value={formatBRL(competence.billed)} />
            <FinanceStatCard label="Despesas" value={formatBRL(competence.expenses)} tone="failed" />
            <FinanceStatCard
              label="Resultado"
              value={formatBRL(competence.result)}
              tone={competence.result >= 0 ? "success" : "failed"}
            />
          </div>
        </section>

        <section className="rounded-[20px] border border-tone-finance-border bg-tone-finance p-5 shadow-card">
          <h3 className="font-serif text-lg font-bold italic">Caixa</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {bounds.start} a {bounds.end} · timezone {timezone}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FinanceStatCard label="Recebido" value={formatBRL(cash.received)} tone="success" />
            <FinanceStatCard label="Despesas pagas" value={formatBRL(cash.expenses)} tone="failed" />
            <FinanceStatCard
              label="Resultado"
              value={formatBRL(cash.result)}
              tone={cash.result >= 0 ? "success" : "failed"}
            />
          </div>
        </section>
      </div>

      <CsvExportPhase4 bounds={bounds} />
      {canWrite ? (
        <ClosingPhase4 bounds={bounds} closings={snapshot.closings} />
      ) : null}
    </section>
  );
}

function CsvExportPhase4({ bounds }: { bounds: { start: string; end: string } }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<CsvColumn[]>([...CSV_COLUMN_VALUES]);

  return (
    <section className="rounded-[20px] border border-tone-finance-border bg-tone-finance p-5 shadow-card">
      <h3 className="font-serif text-lg font-bold italic">Exportação contábil</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Em caixa, cada pagamento real vira uma linha própria. Em competência, cada cobrança permanece uma linha.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const mode = String(form.get("mode")) as FinanceScope;
            const result = await exportFinanceCsvV2Action({
              periodStart: String(form.get("periodStart")),
              periodEnd: String(form.get("periodEnd")),
              mode,
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
            link.download = `virginiapsi-financeiro-${mode}-${form.get("periodStart")}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
            De
            <Input name="periodStart" type="date" required defaultValue={bounds.start} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
            Até
            <Input name="periodEnd" type="date" required defaultValue={bounds.end} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
            Base
            <select name="mode" className={selectClass} defaultValue="competence">
              <option value="competence">Competência</option>
              <option value="cash">Caixa</option>
            </select>
          </label>
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
        {error ? <p role="alert" className="text-sm text-failed">{error}</p> : null}
      </form>
    </section>
  );
}

function ClosingPhase4({
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
    <section className="rounded-[20px] border border-tone-finance-border bg-tone-finance p-5 shadow-card">
      <h3 className="font-serif text-lg font-bold italic">Fechamentos</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Feche competência e caixa separadamente. Um fechamento de competência não impede recebimento posterior.
      </p>
      <form
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await closeFinancialPeriodV2Action({
              periodStart: String(form.get("periodStart")),
              periodEnd: String(form.get("periodEnd")),
              scope: String(form.get("scope")),
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
          Início
          <Input name="periodStart" type="date" required defaultValue={bounds.start} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
          Fim
          <Input name="periodEnd" type="date" required defaultValue={bounds.end} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-deep-neutral">
          Tipo
          <select name="scope" className={selectClass} defaultValue="competence">
            <option value="competence">Competência</option>
            <option value="cash">Caixa</option>
          </select>
        </label>
        <Button type="submit" size="sm" isLoading={isPending}>
          Fechar período
        </Button>
      </form>
      {error ? <p role="alert" className="mt-2 text-sm text-failed">{error}</p> : null}

      {closings.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {closings.map((closing) => {
            const scope = scopeFromClosing(closing);
            return (
              <li
                key={closing.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm"
              >
                <span>
                  <strong>{scope === "cash" ? "Caixa" : "Competência"}</strong> · {closing.period_start} a {closing.period_end} · {closing.status === "closed" ? "fechado" : "reaberto"}
                </span>
                {closing.status === "closed" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    isLoading={isPending}
                    onClick={() => {
                      const reason = askReason(`Informe o motivo da reabertura do ${scope === "cash" ? "caixa" : "período de competência"}:`);
                      if (!reason) return;
                      setError(null);
                      startTransition(async () => {
                        const result = await reopenPeriodWithReasonAction(closing.id, reason);
                        if (result.error) {
                          setError(result.error);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                  >
                    Reabrir
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
