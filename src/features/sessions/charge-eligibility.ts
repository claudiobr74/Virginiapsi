export interface ChargePlanSnapshot {
  status: string;
  plan_type: string;
  total_sessions?: number | null;
  used_sessions: number;
}

function numericFee(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether the session-close wizard should offer an explicit charge.
 * Monthly plans already cover the encounter (RPC returns null). Packages
 * consume a session; a default fee creates an avulsa charge.
 */
export function sessionChargeIsApplicable(input: {
  defaultSessionValue: string | number | null | undefined;
  plans: ChargePlanSnapshot[];
}): boolean {
  const active = input.plans.filter((plan) => plan.status === "active");
  if (active.some((plan) => plan.plan_type === "monthly")) {
    return false;
  }
  const packageOpen = active.some(
    (plan) =>
      (plan.plan_type === "prepaid_package" || plan.plan_type === "postpaid_package") &&
      (plan.total_sessions == null || plan.used_sessions < plan.total_sessions),
  );
  if (packageOpen) {
    return true;
  }
  return numericFee(input.defaultSessionValue) > 0;
}
