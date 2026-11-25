/**
 * POPCONTROL — CURRENCY & NUMBER FORMATTING (INTEGER CENTS)
 * Guarantees zero floating-point errors across the entire ERP.
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer cents into BRL string (e.g., 589 -> "R$ 5,89", 13000 -> "R$ 130,00")
 */
export function formatCentsToBRL(cents: number): string {
  if (!Number.isFinite(cents)) return 'R$ 0,00';
  const reais = Math.round(cents) / 100;
  return brlFormatter.format(reais);
}

/**
 * Formats integer cents to plain decimal string for inputs (e.g. 589 -> "5,89")
 */
export function formatCentsToDecimal(cents: number): string {
  if (!Number.isFinite(cents)) return '0,00';
  const reais = Math.round(cents) / 100;
  return numberFormatter.format(reais);
}

/**
 * Parses a BRL or decimal string/number into integer cents.
 * E.g. "5,89" -> 589 | "12.00" -> 1200 | 130 -> 13000
 */
export function parseReaisToCents(input: string | number): number {
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[R$\s]/g, '').trim();
  if (!cleaned) return 0;

  // Handle Brazilian format (e.g., "1.234,56" or "5,89")
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

/**
 * Formats a percentage value safely (e.g., 50.9166 -> "50,92%")
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0,00%';
  return `${percentFormatter.format(value)}%`;
}

/**
 * Safe division preventing NaN or Infinity when denominator is zero
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(denominator) || !Number.isFinite(numerator)) {
    return 0;
  }
  return numerator / denominator;
}
