export function formatNumber(value: string | number, fractionDigits = 0): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits }).format(n);
}

export function formatMoney(value: string | number, currency: 'UZS' | 'USD' = 'UZS'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  const formatted = formatNumber(n, 0);
  return currency === 'USD' ? `$${formatted}` : `${formatted} сум`;
}

export function formatDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
