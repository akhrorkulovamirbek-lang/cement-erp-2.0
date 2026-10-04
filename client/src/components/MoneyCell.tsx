import { formatMoney } from '@/lib/format';

/** Отображение денежной суммы в табличной ячейке: если операция (частично) в долларах —
 * сверху сумовый эквивалент, снизу мелким текстом исходная разбивка по валютам. Для чистой
 * суммы в сумах — просто formatMoney, без второй строки. Дополняет ввод-компонент MoneyFields. */
export function MoneyCell({
  amount,
  currency,
  usdRate,
  extraAmount,
}: {
  amount: string | number;
  currency: 'UZS' | 'USD';
  usdRate?: string | number | null;
  extraAmount?: string | number | null;
}) {
  const rate = Number(usdRate || 0);
  const toUzs = (value: number, cur: 'UZS' | 'USD') => (cur === 'USD' ? value * rate : value);

  const primary = Number(amount);
  const extra = extraAmount ? Number(extraAmount) : 0;
  const extraCurrency: 'UZS' | 'USD' = currency === 'USD' ? 'UZS' : 'USD';

  if (currency === 'UZS' && !extra) {
    return <span>{formatMoney(primary, 'UZS')}</span>;
  }

  const totalUzs = toUzs(primary, currency) + (extra ? toUzs(extra, extraCurrency) : 0);
  const parts = [formatMoney(primary, currency)];
  if (extra) parts.push(formatMoney(extra, extraCurrency));

  return (
    <div>
      <div>{formatMoney(totalUzs, 'UZS')}</div>
      <div className="text-xs font-normal text-muted-foreground">{parts.join(' + ')}</div>
    </div>
  );
}
