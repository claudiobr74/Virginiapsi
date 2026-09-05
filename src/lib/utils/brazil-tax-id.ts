/** Digits only — CPF/CNPJ persist as numerals, UI may show punctuation. */
export function digitsOnly(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

export function isValidCpf(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const calcCheckDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calcCheckDigit(9) === Number(digits[9]) &&
    calcCheckDigit(10) === Number(digits[10])
  );
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const calcCheckDigit = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (acc, weight, index) => acc + Number(digits[index]) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    calcCheckDigit(12) === Number(digits[12]) &&
    calcCheckDigit(13) === Number(digits[13])
  );
}

export function formatCpfDisplay(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  if (digits.length !== 11) {
    return value?.trim() || "—";
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpjDisplay(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  if (digits.length !== 14) {
    return value?.trim() || "—";
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function cpfInputValue(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.length === 11 ? formatCpfDisplay(digits) : digits;
}

export function cnpjInputValue(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.length === 14 ? formatCnpjDisplay(digits) : digits;
}

/** Empty → null. Otherwise digits-only, ready to persist. */
export function normalizeOptionalCpf(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return digits ? digits : null;
}

export function normalizeOptionalCnpj(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return digits ? digits : null;
}
