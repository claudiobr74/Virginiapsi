export function ageFromBirthDate(
  isoDate: string | null | undefined,
  today = new Date(),
): number | null {
  if (!isoDate) {
    return null;
  }
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function formatBirthDateLabel(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "—";
  }
  const formatted = new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-BR");
  const age = ageFromBirthDate(isoDate);
  if (age == null) {
    return formatted;
  }
  return `${formatted} (${age} ${age === 1 ? "ano" : "anos"})`;
}

export function formatCadastroDate(
  iso: string,
  timeZone = "America/Sao_Paulo",
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatCpfDisplay(value: string | null | undefined): string {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length !== 11) {
    return value?.trim() || "—";
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
