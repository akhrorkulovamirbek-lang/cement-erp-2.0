import { useState } from 'react';
import { usePackagingCheck } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/ui/button';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const SRC: Record<string, string> = { incoming: 'Приход', sales: 'Продажа', tickets: 'Тикет' };
const label = (p: 'MESHOK' | 'NAVAL' | null) => (p ? PACKAGING_LABELS[p] : 'не указана');

/** Сверка упаковки: сравнивает слово «мешок»/«навал» в названии марки с полем «Упаковка» в записях. Только чтение —
 * ничего не меняет. Нужна перед тем, как убирать упаковку из названий марок. */
export function PackagingCheck() {
  const [open, setOpen] = useState(false);
  const check = usePackagingCheck(open);
  const d = check.data;

  const withHint = (d?.marks ?? []).filter((m) => m.hint);
  const totalWrong = (d?.mismatchTotal ?? 0) + withHint.reduce((s, m) => s + (m.stockWrong > 0 ? 1 : 0), 0);

  return (
    <div className="mb-5 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Сверка упаковки</div>
          <p className="text-sm text-muted-foreground">Проверяет, совпадает ли «мешок» или «навал» в названии марки с упаковкой в приходах, продажах, тикетах и на складе. Ничего не меняет.</p>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)} disabled={check.isFetching}>
          {check.isFetching ? 'Проверяю…' : d ? 'Проверить заново' : 'Проверить'}
        </Button>
      </div>

      {open && d && (
        <div className="mt-4 space-y-4">
          {withHint.length === 0 ? (
            <p className="text-sm text-muted-foreground">В названиях марок нет слов «мешок» и «навал» — сверять нечего.</p>
          ) : (
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                totalWrong === 0 ? 'border-emerald-600/30 bg-emerald-600/10' : 'border-destructive/30 bg-destructive/10',
              )}
            >
              {totalWrong === 0 ? (
                <>Всё совпадает: во всех записях упаковка такая же, как в названии марки. Марки можно объединять без потери информации.</>
              ) : (
                <>
                  Найдено расхождений: <b>{d.mismatchTotal}</b> записей{withHint.some((m) => m.stockWrong > 0) ? ' и остатки склада' : ''}, где упаковка не совпадает с названием марки. Перед объединением их нужно исправить — список ниже.
                </>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Марка</th>
                  <th className="px-3 py-2 text-left font-medium">В названии</th>
                  <th className="px-3 py-2 text-right font-medium">Мешок</th>
                  <th className="px-3 py-2 text-right font-medium">Навал</th>
                  <th className="px-3 py-2 text-left font-medium">Итог</th>
                </tr>
              </thead>
              <tbody>
                {d.marks.map((m) => {
                  const cell = (c: PackagingCheckCell) => `приходов ${c.incoming} · продаж ${c.sales} · тикетов ${c.tickets} · склад ${formatNumber(c.stockTon, 2)} т`;
                  const bad = m.wrong > 0 || m.stockWrong > 0;
                  return (
                    <tr key={m.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2">{m.hint ? label(m.hint) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{cell(m.by.MESHOK)}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{cell(m.by.NAVAL)}</td>
                      <td className="px-3 py-2">
                        {!m.hint ? <Badge tone="slate">упаковки в названии нет</Badge> : bad ? <Badge tone="red">есть расхождения</Badge> : <Badge tone="green">совпадает</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {d.mismatches.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">Записи с расхождением{d.mismatchTotal > d.mismatches.length ? ` (показаны первые ${d.mismatches.length} из ${d.mismatchTotal})` : ''}</div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Что</th>
                      <th className="px-3 py-2 text-left font-medium">Дата</th>
                      <th className="px-3 py-2 text-left font-medium">Кто</th>
                      <th className="px-3 py-2 text-left font-medium">Марка</th>
                      <th className="px-3 py-2 text-right font-medium">Тонн</th>
                      <th className="px-3 py-2 text-left font-medium">В записи</th>
                      <th className="px-3 py-2 text-left font-medium">По названию</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.mismatches.map((r) => (
                      <tr key={`${r.src}-${r.id}`} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{SRC[r.src]} №{r.id}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="px-3 py-1.5">{r.who ?? '—'}</td>
                        <td className="px-3 py-1.5">{r.mark}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(r.tonnage, 3)}</td>
                        <td className="px-3 py-1.5 text-destructive">{label(r.packaging)}</td>
                        <td className="px-3 py-1.5">{label(r.expected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type PackagingCheckCell = { incoming: number; sales: number; tickets: number; stockTon: number };
