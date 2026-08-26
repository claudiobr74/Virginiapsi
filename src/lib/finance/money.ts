/**
 * Money helpers — integer cents only. numeric(12,2) in Postgres is the source
 * of truth; this module never uses IEEE-754 for arithmetic
 * (prompts/10-finance.md, docs/04-data-model.md).
 *
 * Canonical wire format: `"1500.50"` (dot decimal, two places). Display is
 * `R$ 1.500,50`. User input accepts either.
 */

export class MoneyParseError extends Error {
  constructor(message = "Informe um valor válido.") {
    super(message);
    this.name = "MoneyParseError";
  }
}

const CANONICAL = /^(-)?(\d+)\.(\d{2})$/;

export function parseToCents(raw: string | number): number {
  let text = String(raw).trim().replace(/[R$\s]/g, "");
  if (!text) {
    throw new MoneyParseError();
  }

  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new MoneyParseError();
  }
  const sign = match[1] ? -1 : 1;
  const whole = Number(match[2]);
  const frac = Number((match[3] ?? "").padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(whole) || whole > 9_999_999_999) {
    throw new MoneyParseError("Valor fora do limite permitido.");
  }
  return sign * (whole * 100 + frac);
}

export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new MoneyParseError("Cálculo financeiro produziu fração de centavo.");
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

export function formatBRL(cents: number): string {
  const canonical = formatCents(cents);
  const negative = canonical.startsWith("-");
  const [whole, frac] = (negative ? canonical.slice(1) : canonical).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${grouped},${frac}`;
}

export function addCents(...values: number[]): number {
  return values.reduce((sum, value) => {
    if (!Number.isInteger(value)) {
      throw new MoneyParseError("Cálculo financeiro produziu fração de centavo.");
    }
    return sum + value;
  }, 0);
}

export function centsFromCanonical(value: string | number | null | undefined): number {
  if (value == null || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    // Postgres numeric sometimes arrives as a JS number. Round to cents
    // rather than truncating, but never keep the float around.
    return Math.round(value * 100);
  }
  const match = CANONICAL.exec(value);
  if (match) {
    const sign = match[1] ? -1 : 1;
    return sign * (Number(match[2]) * 100 + Number(match[3]));
  }
  return parseToCents(value);
}

export type DerivedChargeStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "overdue";

export function deriveChargeStatus(input: {
  amountCents: number;
  paidCents: number;
  dueDate: string | null;
  today?: string;
  lockedStatus?: "canceled" | "refunded" | null;
}): DerivedChargeStatus | "canceled" | "refunded" {
  if (input.lockedStatus) {
    return input.lockedStatus;
  }
  if (input.amountCents > 0 && input.paidCents >= input.amountCents) {
    return "paid";
  }
  if (input.paidCents > 0) {
    return "partially_paid";
  }
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (input.dueDate && input.dueDate < today) {
    return "overdue";
  }
  return "pending";
}

export function remainingCents(amountCents: number, paidCents: number): number {
  const left = amountCents - paidCents;
  return left > 0 ? left : 0;
}
