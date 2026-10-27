import { useMemo, useState, type ReactNode } from 'react';
import {
  useBrokerReport,
  useCashFlow,
  useDealMargins,
  useMachinesReport,
  usePnl,
  useStockReport,
  type DealMargin,
  type MachineRow,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { downloadStyledTable } from '@/lib/styledExcel';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const SOURCE_LABELS: Record<string, string> = { warehouse: 'Со склада', ticket: 'По тикетам', direct: 'Напрямую с завода' };
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1).replace('.', ',')}%` : '—');
const tone = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-destructive' : '');

function usePeriod() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return { from, to, setFrom, setTo, params: { from: from || undefined, to: to || undefined } };
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-muted-foreground">{children}</p>;
}

function ExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      Скачать в Excel
    </Button>
  );
}

/** Простая таблица-ведомость: строки — показатели, колонки — разрезы. */
function Statement({ title, columns, rows }: { title: string; columns: string[]; rows: { label: string; values: ReactNode[]; strong?: boolean; sign?: number[] }[] }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-md border">
      <div className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium"></th>
            {columns.map((c) => (
              <th key={c} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={cn('border-b last:border-0', r.strong && 'bg-muted/30 font-semibold')}>
              <td className="px-4 py-2 whitespace-nowrap">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className={cn('px-4 py-2 text-right tabular-nums whitespace-nowrap', r.sign && tone(r.sign[i] ?? 0))}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- 1. P&L

export function PnlTab() {
  const { notify } = useToast();
  const period = usePeriod();
  const pnl = usePnl(period.params);
  const d = pnl.data;

  const model = useMemo(() => {
    if (!d) return null;
    const by = (s: string) => d.cement.find((r) => r.source === s) ?? { deals: 0, tonnage: 0, revenue: 0, cost: 0, margin: 0 };
    const cols = ['warehouse', 'ticket', 'direct'].map(by);
    const cementTotal = cols.reduce(
      (a, r) => ({ deals: a.deals + r.deals, tonnage: a.tonnage + r.tonnage, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, margin: a.margin + r.margin }),
      { deals: 0, tonnage: 0, revenue: 0, cost: 0, margin: 0 },
    );
    const own = d.logistics.own;
    const hired = d.logistics.hired;
    const logTotal = { trips: own.trips + hired.trips, tonnage: own.tonnage + hired.tonnage, revenue: own.revenue + hired.revenue, cost: own.cost + hired.cost };
    const logProfit = logTotal.revenue - logTotal.cost;
    const net = cementTotal.margin + logProfit + d.other.cashServiceCommission - d.other.otherExpenses;
    return { cols, cementTotal, own, hired, logTotal, logProfit, net };
  }, [d]);

  async function exportExcel() {
    if (!model || !d) return;
    const rows: (string | number | null)[][] = [];
    const fills: (string | undefined)[] = [];
    const add = (section: string, label: string, value: number, fill?: string) => {
      rows.push([section, label, value]);
      fills.push(fill);
    };
    const m = model;
    add('Торговля цементом', 'Выручка', m.cementTotal.revenue);
    add('Торговля цементом', 'Себестоимость', m.cementTotal.cost);
    add('Торговля цементом', 'Валовая прибыль', m.cementTotal.margin, 'FFE6F4EA');
    for (const s of ['warehouse', 'ticket', 'direct']) {
      const r = d.cement.find((x) => x.source === s);
      if (r) add('Торговля цементом', `  в т.ч. ${SOURCE_LABELS[s]} — прибыль`, r.margin);
    }
    add('Логистика', 'Выручка (доставка клиентам)', m.logTotal.revenue);
    add('Логистика', 'Расходы: наём перевозчиков', m.hired.cost);
    add('Логистика', 'Расходы: свои машины', m.own.cost);
    add('Логистика', 'Прибыль логистики', m.logProfit, 'FFE6F4EA');
    add('Итого', 'Выручка всего', m.cementTotal.revenue + m.logTotal.revenue);
    add('Итого', 'Комиссия обналичивания', d.other.cashServiceCommission);
    add('Итого', 'Прочие расходы', -d.other.otherExpenses);
    add('Итого', 'ЧИСТАЯ ПРИБЫЛЬ', m.net, 'FFFFF4E0');
    await downloadStyledTable({
      filename: 'Прибыли_и_убытки.xlsx',
      sheetName: 'P&L',
      title: 'Прибыли и убытки по направлениям',
      subtitle: period.from || period.to ? `период ${period.from || '…'} — ${period.to || '…'}` : 'за всё время',
      columns: [
        { header: 'Направление', width: 24 },
        { header: 'Показатель', width: 38 },
        { header: 'Сумма, сум', width: 20, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows,
      rowFills: fills,
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  return (
    <div>
      <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />
      <Note>
        Выручка и себестоимость — по продажам (начисление), а не по оплатам. Оплаты поставщикам, пополнение брокерского счёта и платежи клиентов — не расходы и не доходы, их видно в отчёте «Движение денег».
        {d && d.excludedHistorical > 0 && ` Загруженная история без себестоимости (${d.excludedHistorical} продаж) в цемент не входит.`}
      </Note>
      {model && d && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Прибыль от цемента" value={formatMoney(model.cementTotal.margin)} tone={model.cementTotal.margin >= 0 ? 'positive' : 'negative'} hint={`маржа ${pct(model.cementTotal.margin, model.cementTotal.revenue)}`} />
            <StatCard label="Прибыль логистики" value={formatMoney(model.logProfit)} tone={model.logProfit >= 0 ? 'positive' : 'negative'} hint={`маржа ${pct(model.logProfit, model.logTotal.revenue)}`} />
            <StatCard label="Чистая прибыль" value={formatMoney(model.net)} tone={model.net >= 0 ? 'positive' : 'negative'} />
          </div>
          <div className="mb-3 flex justify-end">
            <ExcelButton onClick={exportExcel} />
          </div>
          <Statement
            title="Торговля цементом (склад, тикеты, напрямую с завода)"
            columns={['Со склада', 'По тикетам', 'Напрямую', 'Итого']}
            rows={[
              { label: 'Продаж', values: [...model.cols.map((c) => c.deals), model.cementTotal.deals] },
              { label: 'Продано, т', values: [...model.cols.map((c) => formatNumber(c.tonnage, 2)), formatNumber(model.cementTotal.tonnage, 2)] },
              { label: 'Выручка', values: [...model.cols.map((c) => formatMoney(c.revenue)), formatMoney(model.cementTotal.revenue)] },
              { label: 'Себестоимость', values: [...model.cols.map((c) => formatMoney(c.cost)), formatMoney(model.cementTotal.cost)] },
              {
                label: 'Валовая прибыль',
                strong: true,
                values: [...model.cols.map((c) => formatMoney(c.margin)), formatMoney(model.cementTotal.margin)],
                sign: [...model.cols.map((c) => c.margin), model.cementTotal.margin],
              },
              { label: 'Маржа, %', values: [...model.cols.map((c) => pct(c.margin, c.revenue)), pct(model.cementTotal.margin, model.cementTotal.revenue)] },
            ]}
          />
          <Statement
            title="Логистика (своя и наёмная техника)"
            columns={['Свои машины', 'Наёмные', 'Итого']}
            rows={[
              { label: 'Рейсов', values: [model.own.trips, model.hired.trips, model.logTotal.trips] },
              { label: 'Перевезено, т', values: [formatNumber(model.own.tonnage, 2), formatNumber(model.hired.tonnage, 2), formatNumber(model.logTotal.tonnage, 2)] },
              { label: 'Выручка (доставка клиентам)', values: [formatMoney(model.own.revenue), formatMoney(model.hired.revenue), formatMoney(model.logTotal.revenue)] },
              { label: 'Расходы (наём / свои машины)', values: [formatMoney(model.own.cost), formatMoney(model.hired.cost), formatMoney(model.logTotal.cost)] },
              {
                label: 'Прибыль логистики',
                strong: true,
                values: [formatMoney(model.own.revenue - model.own.cost), formatMoney(model.hired.revenue - model.hired.cost), formatMoney(model.logProfit)],
                sign: [model.own.revenue - model.own.cost, model.hired.revenue - model.hired.cost, model.logProfit],
              },
              {
                label: 'Маржа, %',
                values: [pct(model.own.revenue - model.own.cost, model.own.revenue), pct(model.hired.revenue - model.hired.cost, model.hired.revenue), pct(model.logProfit, model.logTotal.revenue)],
              },
            ]}
          />
          <Statement
            title="Консолидированный итог"
            columns={['Сумма']}
            rows={[
              { label: 'Выручка: цемент', values: [formatMoney(model.cementTotal.revenue)] },
              { label: 'Выручка: логистика', values: [formatMoney(model.logTotal.revenue)] },
              { label: 'Прибыль от цемента', values: [formatMoney(model.cementTotal.margin)], sign: [model.cementTotal.margin] },
              { label: 'Прибыль логистики', values: [formatMoney(model.logProfit)], sign: [model.logProfit] },
              { label: 'Комиссия обналичивания', values: [formatMoney(d.other.cashServiceCommission)] },
              { label: 'Прочие расходы (категория «прочее» в кассе)', values: [`− ${formatMoney(d.other.otherExpenses)}`] },
              { label: 'Чистая прибыль', strong: true, values: [formatMoney(model.net)], sign: [model.net] },
            ]}
          />
        </>
      )}
      {pnl.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 2. Маржа по сделкам

interface Group {
  key: string;
  name: string;
  deals: number;
  tonnage: number;
  revenue: number;
  cost: number;
  margin: number;
}

function groupBy(rows: DealMargin[], keyOf: (r: DealMargin) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = map.get(key) ?? { key, name: key, deals: 0, tonnage: 0, revenue: 0, cost: 0, margin: 0 };
    g.deals += 1;
    g.tonnage += Number(r.tonnage);
    g.revenue += Number(r.revenue);
    g.cost += Number(r.cost);
    g.margin += Number(r.margin);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.margin - a.margin);
}

export function DealMarginsTab() {
  const { notify } = useToast();
  const period = usePeriod();
  const report = useDealMargins(period.params);
  const rows = report.data ?? [];
  const sum = (rs: { revenue: unknown; cost: unknown; margin: unknown; tonnage: unknown }[]) =>
    rs.reduce((a, r) => ({ t: a.t + Number(r.tonnage), rev: a.rev + Number(r.revenue), cost: a.cost + Number(r.cost), m: a.m + Number(r.margin) }), { t: 0, rev: 0, cost: 0, m: 0 });

  const dealColumns: Column<DealMargin>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'client_name', header: 'Клиент', sortValue: (r) => r.client_name },
    { key: 'mark', header: 'Марка', sortValue: (r) => r.mark ?? '', render: (r) => `${r.mark ?? '—'}${r.packaging ? ` · ${PACKAGING_LABELS[r.packaging as 'MESHOK' | 'NAVAL'] ?? ''}` : ''}` },
    { key: 'source', header: 'Источник', sortValue: (r) => SOURCE_LABELS[r.source] ?? r.source, render: (r) => SOURCE_LABELS[r.source] ?? r.source },
    { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => formatNumber(r.tonnage, 3) },
    { key: 'price_per_ton', header: 'Цена продажи/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton) },
    { key: 'cost_per_ton', header: 'Себестоимость/т', align: 'right', sortValue: (r) => Number(r.cost_per_ton), render: (r) => formatMoney(r.cost_per_ton) },
    {
      key: 'margin',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin),
      render: (r) => <span className={cn('font-medium', tone(Number(r.margin)))}>{formatMoney(r.margin)}</span>,
    },
    { key: 'margin_pct', header: 'Маржа, %', align: 'right', sortValue: (r) => (Number(r.revenue) ? Number(r.margin) / Number(r.revenue) : 0), render: (r) => pct(Number(r.margin), Number(r.revenue)) },
  ];

  const groupColumns = (title: string): Column<Group>[] => [
    { key: 'name', header: title, sortValue: (g) => g.name },
    { key: 'deals', header: 'Сделок', align: 'right', sortValue: (g) => g.deals },
    { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (g) => g.tonnage, render: (g) => formatNumber(g.tonnage, 2) },
    { key: 'revenue', header: 'Выручка', align: 'right', sortValue: (g) => g.revenue, render: (g) => formatMoney(g.revenue) },
    { key: 'cost', header: 'Себестоимость', align: 'right', sortValue: (g) => g.cost, render: (g) => formatMoney(g.cost) },
    { key: 'margin', header: 'Маржа', align: 'right', sortValue: (g) => g.margin, render: (g) => <span className={cn('font-medium', tone(g.margin))}>{formatMoney(g.margin)}</span> },
    { key: 'pct', header: 'Маржа, %', align: 'right', sortValue: (g) => (g.revenue ? g.margin / g.revenue : 0), render: (g) => pct(g.margin, g.revenue) },
  ];
  const groupFooter = (vis: Group[]) => {
    const t = vis.reduce((a, g) => ({ d: a.d + g.deals, t: a.t + g.tonnage, rev: a.rev + g.revenue, c: a.c + g.cost, m: a.m + g.margin }), { d: 0, t: 0, rev: 0, c: 0, m: 0 });
    return ['Итого', t.d, formatNumber(t.t, 2), formatMoney(t.rev), formatMoney(t.c), formatMoney(t.m), pct(t.m, t.rev)];
  };

  const byClient = useMemo(() => groupBy(rows, (r) => r.client_name), [rows]);
  const byMark = useMemo(() => groupBy(rows, (r) => `${r.mark ?? '—'}${r.packaging ? ` · ${PACKAGING_LABELS[r.packaging as 'MESHOK' | 'NAVAL'] ?? ''}` : ''}`), [rows]);

  async function exportExcel() {
    const t = sum(rows);
    await downloadStyledTable({
      filename: 'Маржа_по_сделкам.xlsx',
      sheetName: 'Маржа по сделкам',
      title: 'Маржа по сделкам',
      subtitle: 'цемент: цена продажи − себестоимость',
      summary: [
        ['Выручка по цементу, сум', t.rev, '#,##0'],
        ['Себестоимость, сум', t.cost, '#,##0'],
        ['Маржа, сум', t.m, '#,##0;[Red]-#,##0'],
      ],
      columns: [
        { header: 'Дата', width: 12, align: 'center' },
        { header: 'Клиент', width: 26 },
        { header: 'Марка', width: 18 },
        { header: 'Источник', width: 20 },
        { header: 'Тонн', width: 11, fmt: '#,##0.000', align: 'right' },
        { header: 'Цена продажи/т', width: 16, fmt: '#,##0', align: 'right' },
        { header: 'Себестоимость/т', width: 16, fmt: '#,##0', align: 'right' },
        { header: 'Выручка', width: 16, fmt: '#,##0', align: 'right' },
        { header: 'Себестоимость', width: 16, fmt: '#,##0', align: 'right' },
        { header: 'Маржа', width: 16, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        { header: 'Маржа, %', width: 11, fmt: '0.0%', align: 'right' },
      ],
      rows: rows.map((r) => [
        formatDate(r.date),
        r.client_name,
        `${r.mark ?? ''}${r.packaging ? ` · ${PACKAGING_LABELS[r.packaging as 'MESHOK' | 'NAVAL'] ?? ''}` : ''}`,
        SOURCE_LABELS[r.source] ?? r.source,
        Number(r.tonnage),
        Number(r.price_per_ton),
        Number(r.cost_per_ton),
        Number(r.revenue),
        Number(r.cost),
        Number(r.margin),
        Number(r.revenue) ? Number(r.margin) / Number(r.revenue) : 0,
      ]),
      totals: ['ИТОГО', '', '', '', t.t, null, null, t.rev, t.cost, t.m, t.rev ? t.m / t.rev : 0],
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  const t = sum(rows);
  return (
    <div>
      <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />
      <Note>Только продажи цемента (цена продажи минус себестоимость: цена тикета или средняя себестоимость склада). Загруженная история без себестоимости не показывается.</Note>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Выручка по цементу" value={formatMoney(t.rev)} hint={`${rows.length} сделок`} />
        <StatCard label="Себестоимость" value={formatMoney(t.cost)} />
        <StatCard label="Маржа" value={formatMoney(t.m)} tone={t.m >= 0 ? 'positive' : 'negative'} hint={pct(t.m, t.rev)} />
      </div>
      <div className="mb-3 flex justify-end">
        <ExcelButton onClick={exportExcel} disabled={rows.length === 0} />
      </div>
      <Tabs defaultValue="deals">
        <TabsList>
          <TabsTrigger value="deals">По сделкам</TabsTrigger>
          <TabsTrigger value="clients">По клиентам</TabsTrigger>
          <TabsTrigger value="marks">По маркам</TabsTrigger>
        </TabsList>
        <TabsContent value="deals" className="mt-3">
          <DataTable
            columns={dealColumns}
            rows={rows}
            loading={report.isLoading}
            getRowId={(r) => r.id}
            searchable
            emptyMessage="Нет продаж цемента за период"
            footer={(vis) => {
              const s = sum(vis);
              return ['Итого', '', '', '', formatNumber(s.t, 3), '', '', formatMoney(s.m), pct(s.m, s.rev)];
            }}
          />
        </TabsContent>
        <TabsContent value="clients" className="mt-3">
          <DataTable columns={groupColumns('Клиент')} rows={byClient} loading={report.isLoading} getRowId={(g) => g.key} searchable footer={groupFooter} emptyMessage="Нет данных" />
        </TabsContent>
        <TabsContent value="marks" className="mt-3">
          <DataTable columns={groupColumns('Марка')} rows={byMark} loading={report.isLoading} getRowId={(g) => g.key} footer={groupFooter} emptyMessage="Нет данных" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- 3. Движение денег

const INCOME_LABELS: Record<string, string> = {
  цемент: 'Оплаты за цемент',
  логистика: 'Оплаты за логистику',
  возврат_биржи: 'Возврат с биржи (тикеты)',
  прочее: 'Прочие поступления',
};
const EXPENSE_LABELS: Record<string, string> = {
  цемент: 'Оплата поставщикам за цемент',
  логистика: 'Расходы на транспорт',
  перевозчик: 'Оплата перевозчикам',
  прочее: 'Прочие расходы',
  обналичивание: 'Выдача наличных (обналичивание)',
  брокер: 'Пополнение брокерского счёта',
  контрагент: 'Выплаты клиентам-поставщикам',
};

export function CashFlowTab() {
  const { notify } = useToast();
  const period = usePeriod();
  const flow = useCashFlow(period.params);
  const d = flow.data;

  const lines = useMemo(() => {
    if (!d) return [];
    const sum = (rows: { UZS: number; USD: number }[]) => ({ UZS: rows.reduce((s, r) => s + r.UZS, 0), USD: rows.reduce((s, r) => s + r.USD, 0) });
    const inc = sum(d.income);
    const exp = sum(d.expense);
    type L = { label: string; UZS: number; USD: number; kind: 'head' | 'item' | 'total' | 'result' };
    return [
      { label: 'Остаток на начало периода', ...d.opening, kind: 'total' },
      { label: 'ПОСТУПЛЕНИЯ', UZS: 0, USD: 0, kind: 'head' },
      ...d.income.map((r) => ({ label: INCOME_LABELS[r.category] ?? r.category, UZS: r.UZS, USD: r.USD, kind: 'item' })),
      { label: 'Итого поступлений', ...inc, kind: 'total' },
      { label: 'ВЫБЫТИЯ', UZS: 0, USD: 0, kind: 'head' },
      ...d.expense.map((r) => ({ label: EXPENSE_LABELS[r.category] ?? r.category, UZS: r.UZS, USD: r.USD, kind: 'item' })),
      { label: 'Итого выбытий', ...exp, kind: 'total' },
      { label: 'Чистое движение за период', UZS: inc.UZS - exp.UZS, USD: inc.USD - exp.USD, kind: 'total' },
      { label: 'Остаток на конец периода', ...d.closing, kind: 'result' },
    ] as L[];
  }, [d]);

  async function exportExcel() {
    await downloadStyledTable({
      filename: 'Движение_денег.xlsx',
      sheetName: 'ДДС',
      title: 'Движение денежных средств',
      subtitle: period.from || period.to ? `период ${period.from || '…'} — ${period.to || '…'}` : 'за всё время',
      columns: [
        { header: 'Статья', width: 42 },
        { header: 'Сум', width: 20, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        { header: 'Доллары, $', width: 16, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows: lines.map((l) => [l.label, l.kind === 'head' ? null : l.UZS, l.kind === 'head' ? null : l.USD]),
      rowFills: lines.map((l) => (l.kind === 'head' ? 'FFEDEDED' : l.kind === 'total' ? 'FFF3F4F6' : l.kind === 'result' ? 'FFFFF4E0' : undefined)),
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  return (
    <div>
      <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />
      <Note>Сумы и доллары считаются отдельно, без пересчёта по курсу. Остаток на начало — всё, что было в кассе до начала периода.</Note>
      <div className="mb-3 flex justify-end">
        <ExcelButton onClick={exportExcel} disabled={!d} />
      </div>
      {d && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Статья</th>
                <th className="px-4 py-2 text-right font-medium">Сум</th>
                <th className="px-4 py-2 text-right font-medium">Доллары</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={cn('border-b last:border-0', l.kind === 'head' && 'bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground', l.kind === 'total' && 'font-medium', l.kind === 'result' && 'bg-muted/30 font-semibold')}>
                  <td className={cn('px-4 py-2', l.kind === 'item' && 'pl-8')}>{l.label}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums', l.kind !== 'head' && tone(l.kind === 'item' ? 0 : l.UZS))}>{l.kind === 'head' ? '' : formatMoney(l.UZS)}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums', l.kind !== 'head' && tone(l.kind === 'item' ? 0 : l.USD))}>{l.kind === 'head' ? '' : formatMoney(l.USD, 'USD')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {flow.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 4. Брокерский счёт

const BROKER_LABELS = { replenish: 'Пополнение', ticket_purchase: 'Покупка тикета', ticket_return: 'Возврат остатка тикета' } as const;

export function BrokerTab() {
  const { notify } = useToast();
  const period = usePeriod();
  const report = useBrokerReport(period.params);
  const d = report.data;
  const rows = d?.rows ?? [];

  const columns: Column<NonNullable<typeof d>['rows'][number]>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'type', header: 'Операция', sortValue: (r) => BROKER_LABELS[r.type], render: (r) => <Badge tone={r.type === 'ticket_purchase' ? 'red' : 'green'}>{BROKER_LABELS[r.type]}</Badge> },
    { key: 'ticket_number', header: 'Тикет', sortValue: (r) => r.ticket_number ?? '', render: (r) => r.ticket_number ?? '—' },
    { key: 'description', header: 'Описание', render: (r) => r.description || '—' },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => (r.type === 'ticket_purchase' ? -r.amount : r.amount),
      render: (r) => <span className={r.type === 'ticket_purchase' ? 'text-destructive' : 'text-emerald-600'}>{r.type === 'ticket_purchase' ? '−' : '+'}{formatMoney(r.amount)}</span>,
    },
    { key: 'balance', header: 'Остаток после', align: 'right', render: (r) => formatMoney(r.balance) },
  ];

  async function exportExcel() {
    if (!d) return;
    await downloadStyledTable({
      filename: 'Брокерский_счёт.xlsx',
      sheetName: 'Брокерский счёт',
      title: 'Выписка по брокерскому счёту',
      subtitle: period.from || period.to ? `период ${period.from || '…'} — ${period.to || '…'}` : 'за всё время',
      summary: [
        ['Остаток на начало, сум', d.opening, '#,##0'],
        ['Пополнения, сум', d.replenish, '#,##0'],
        ['Покупка тикетов, сум', -d.purchases, '#,##0;[Red]-#,##0'],
        ['Возвраты, сум', d.returns, '#,##0'],
        ['Остаток на конец, сум', d.closing, '#,##0;[Red]-#,##0'],
      ],
      columns: [
        { header: 'Дата', width: 12, align: 'center' },
        { header: 'Операция', width: 24 },
        { header: 'Тикет', width: 14 },
        { header: 'Описание', width: 36 },
        { header: 'Сумма, сум', width: 18, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        { header: 'Остаток после, сум', width: 20, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows: d.rows.map((r) => [formatDate(r.date), BROKER_LABELS[r.type], r.ticket_number ?? '', r.description ?? '', r.type === 'ticket_purchase' ? -r.amount : r.amount, r.balance]),
      rowFills: d.rows.map((r) => (r.type === 'ticket_purchase' ? 'FFFDECEA' : 'FFE6F4EA')),
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  return (
    <div>
      <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />
      <Note>Для сверки с брокером: остаток на конец должен совпасть с остатком в личном кабинете брокера.</Note>
      {d && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Остаток на начало" value={formatMoney(d.opening)} />
          <StatCard label="Пополнения" value={formatMoney(d.replenish)} tone="positive" />
          <StatCard label="Покупка тикетов" value={formatMoney(d.purchases)} tone="negative" hint={d.returns > 0 ? `возвраты ${formatMoney(d.returns)}` : undefined} />
          <StatCard label="Остаток на конец" value={formatMoney(d.closing)} hint={`сейчас на счёте: ${formatMoney(d.currentBalance)}`} />
        </div>
      )}
      <div className="mb-3 flex justify-end">
        <ExcelButton onClick={exportExcel} disabled={!d} />
      </div>
      <DataTable columns={columns} rows={rows} loading={report.isLoading} getRowId={(r) => r.id} emptyMessage="Нет операций за период" />
    </div>
  );
}

// ---------------------------------------------------------------- 5. Остатки

export function StockTab() {
  const { notify } = useToast();
  const stock = useStockReport();
  const d = stock.data;
  const whValue = (d?.warehouse ?? []).reduce((s, r) => s + r.value, 0);
  const tkValue = (d?.tickets ?? []).reduce((s, r) => s + r.value, 0);
  const whTon = (d?.warehouse ?? []).reduce((s, r) => s + r.tonnage, 0);
  const tkTon = (d?.tickets ?? []).reduce((s, r) => s + r.tonnage, 0);
  const pack = (p: string) => PACKAGING_LABELS[p as 'MESHOK' | 'NAVAL'] ?? p;

  async function exportExcel() {
    if (!d) return;
    const rows: (string | number | null)[][] = [
      ...d.warehouse.map((r) => ['Склад', r.zavod_name, r.mark, pack(r.packaging), '', r.tonnage, r.avg_cost_per_ton, r.value]),
      ...d.tickets.map((r) => ['Тикет', r.zavod_name, r.mark, pack(r.packaging), r.ticket_number, r.tonnage, r.price_per_ton, r.value]),
    ];
    await downloadStyledTable({
      filename: 'Остатки_склад_и_тикеты.xlsx',
      sheetName: 'Остатки',
      title: 'Остатки: склад и тикеты',
      subtitle: 'на сегодня, по себестоимости',
      summary: [
        ['Склад, сум', whValue, '#,##0'],
        ['Тикеты, сум', tkValue, '#,##0'],
        ['Всего в товаре, сум', whValue + tkValue, '#,##0'],
      ],
      columns: [
        { header: 'Где', width: 10 },
        { header: 'Поставщик', width: 22 },
        { header: 'Марка', width: 16 },
        { header: 'Упаковка', width: 12 },
        { header: 'Тикет', width: 12 },
        { header: 'Тонн', width: 12, fmt: '#,##0.000', align: 'right' },
        { header: 'Цена/себестоимость за т', width: 20, fmt: '#,##0', align: 'right' },
        { header: 'Стоимость, сум', width: 18, fmt: '#,##0', align: 'right' },
      ],
      rows,
      rowFills: rows.map((r) => (r[0] === 'Склад' ? 'FFFFF4E0' : 'FFE3F0FB')),
      totals: ['ИТОГО', '', '', '', '', whTon + tkTon, null, whValue + tkValue],
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  return (
    <div>
      <Note>Остатки на сегодня: сколько цемента и денег «заморожено» на складе и в тикетах. Склад оценён по средней себестоимости, тикеты — по цене покупки.</Note>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Склад" value={formatMoney(whValue)} hint={`${formatNumber(whTon, 2)} т`} />
        <StatCard label="Тикеты" value={formatMoney(tkValue)} hint={`${formatNumber(tkTon, 2)} т`} />
        <StatCard label="Всего в товаре" value={formatMoney(whValue + tkValue)} hint={`${formatNumber(whTon + tkTon, 2)} т`} />
      </div>
      <div className="mb-3 flex justify-end">
        <ExcelButton onClick={exportExcel} disabled={!d} />
      </div>
      <h3 className="mb-2 text-sm font-semibold">Склад (Факт)</h3>
      <div className="mb-6">
        <DataTable
          columns={[
            { key: 'zavod_name', header: 'Поставщик', sortValue: (r) => r.zavod_name },
            { key: 'mark', header: 'Марка', sortValue: (r) => r.mark },
            { key: 'packaging', header: 'Упаковка', render: (r) => pack(r.packaging) },
            { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (r) => r.tonnage, render: (r) => formatNumber(r.tonnage, 3) },
            { key: 'avg_cost_per_ton', header: 'Себестоимость/т', align: 'right', render: (r) => formatMoney(r.avg_cost_per_ton) },
            { key: 'value', header: 'Стоимость', align: 'right', sortValue: (r) => r.value, render: (r) => formatMoney(r.value) },
          ]}
          rows={d?.warehouse ?? []}
          loading={stock.isLoading}
          getRowId={(r) => `${r.zavod_name}-${r.mark}-${r.packaging}`}
          emptyMessage="Склад пуст"
          footer={['Итого', '', '', formatNumber(whTon, 3), '', formatMoney(whValue)]}
        />
      </div>
      <h3 className="mb-2 text-sm font-semibold">Тикеты (активные)</h3>
      <DataTable
        columns={[
          { key: 'ticket_number', header: 'Тикет', sortValue: (r) => r.ticket_number },
          { key: 'zavod_name', header: 'Поставщик', sortValue: (r) => r.zavod_name },
          { key: 'mark', header: 'Марка', sortValue: (r) => r.mark },
          { key: 'packaging', header: 'Упаковка', render: (r) => pack(r.packaging) },
          { key: 'tonnage', header: 'Остаток, т', align: 'right', sortValue: (r) => r.tonnage, render: (r) => formatNumber(r.tonnage, 3) },
          { key: 'price_per_ton', header: 'Цена покупки/т', align: 'right', render: (r) => formatMoney(r.price_per_ton) },
          { key: 'value', header: 'Стоимость', align: 'right', sortValue: (r) => r.value, render: (r) => formatMoney(r.value) },
        ]}
        rows={d?.tickets ?? []}
        loading={stock.isLoading}
        getRowId={(r) => r.ticket_number}
        emptyMessage="Активных тикетов нет"
        footer={['Итого', '', '', '', formatNumber(tkTon, 3), '', formatMoney(tkValue)]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 6. Машины и рейсы

export function MachinesTab() {
  const { notify } = useToast();
  const period = usePeriod();
  const report = useMachinesReport(period.params);
  const rows = report.data ?? [];

  const agg = (type: 'own' | 'hired') => {
    const rs = rows.filter((r) => r.type === type);
    const t = rs.reduce((a, r) => ({ ton: a.ton + r.tonnage, rev: a.rev + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit, trips: a.trips + r.trips }), { ton: 0, rev: 0, cost: 0, profit: 0, trips: 0 });
    return { ...t, perTon: t.ton ? t.profit / t.ton : 0 };
  };
  const own = agg('own');
  const hired = agg('hired');
  const costText = (r: MachineRow) => r.costs.filter((c) => c.amount > 0).map((c) => `${c.type}: ${formatNumber(c.amount, 0)}`).join('; ') || '—';

  const columns: Column<MachineRow>[] = [
    { key: 'label', header: 'Машина / перевозчик', sortValue: (r) => r.label },
    { key: 'type', header: 'Тип', sortValue: (r) => r.type, render: (r) => <Badge tone={r.type === 'own' ? 'blue' : 'slate'}>{r.type === 'own' ? 'Своя' : 'Наёмная'}</Badge> },
    { key: 'trips', header: 'Рейсов', align: 'right', sortValue: (r) => r.trips },
    { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (r) => r.tonnage, render: (r) => formatNumber(r.tonnage, 2) },
    { key: 'revenue', header: 'Выручка', align: 'right', sortValue: (r) => r.revenue, render: (r) => formatMoney(r.revenue) },
    { key: 'cost', header: 'Расходы', align: 'right', sortValue: (r) => r.cost, render: (r) => formatMoney(r.cost) },
    { key: 'costs', header: 'Из чего расходы', render: (r) => <span className="text-xs text-muted-foreground">{costText(r)}</span> },
    { key: 'profit', header: 'Прибыль', align: 'right', sortValue: (r) => r.profit, render: (r) => <span className={cn('font-medium', tone(r.profit))}>{formatMoney(r.profit)}</span> },
    { key: 'perTon', header: 'Прибыль на тонну', align: 'right', sortValue: (r) => (r.tonnage ? r.profit / r.tonnage : 0), render: (r) => (r.tonnage ? formatMoney(r.profit / r.tonnage) : '—') },
  ];

  async function exportExcel() {
    await downloadStyledTable({
      filename: 'Прибыль_по_машинам.xlsx',
      sheetName: 'Машины',
      title: 'Прибыль по машинам и рейсам',
      subtitle: period.from || period.to ? `период ${period.from || '…'} — ${period.to || '…'}` : 'за всё время',
      summary: [
        ['Своя машина: прибыль на тонну, сум', own.perTon, '#,##0;[Red]-#,##0'],
        ['Наёмная: прибыль на тонну, сум', hired.perTon, '#,##0;[Red]-#,##0'],
      ],
      columns: [
        { header: 'Машина / перевозчик', width: 28 },
        { header: 'Тип', width: 10 },
        { header: 'Рейсов', width: 9, align: 'right' },
        { header: 'Тонн', width: 11, fmt: '#,##0.00', align: 'right' },
        { header: 'Выручка, сум', width: 17, fmt: '#,##0', align: 'right' },
        { header: 'Расходы, сум', width: 17, fmt: '#,##0', align: 'right' },
        { header: 'Из чего расходы', width: 44 },
        { header: 'Прибыль, сум', width: 17, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        { header: 'Прибыль на тонну, сум', width: 19, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows: rows.map((r) => [r.label, r.type === 'own' ? 'Своя' : 'Наёмная', r.trips, r.tonnage, r.revenue, r.cost, costText(r), r.profit, r.tonnage ? r.profit / r.tonnage : 0]),
      rowFills: rows.map((r) => (r.type === 'own' ? 'FFE3F0FB' : undefined)),
      totals: ['ИТОГО', '', own.trips + hired.trips, own.ton + hired.ton, own.rev + hired.rev, own.cost + hired.cost, '', own.profit + hired.profit, null],
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  const better = own.ton && hired.ton ? (own.perTon > hired.perTon ? 'Своя машина выгоднее на' : 'Наёмная выгоднее на') : null;
  return (
    <div>
      <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />
      <Note>
        Выручка — доставка, оплаченная клиентами. Расходы своих машин — из кассы (категория «Расходы на транспорт» с номером машины: топливо, ремонт и т.д.), наёмных — по цене найма в рейсах. Чтобы учесть амортизацию или аренду своей
        машины, вносите их расходом в кассе с её номером — они сразу попадут сюда.
      </Note>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Своя: прибыль на тонну" value={own.ton ? formatMoney(own.perTon) : '—'} tone={own.perTon >= 0 ? 'positive' : 'negative'} hint={`${own.trips} рейсов, ${formatNumber(own.ton, 1)} т`} />
        <StatCard label="Наёмная: прибыль на тонну" value={hired.ton ? formatMoney(hired.perTon) : '—'} tone={hired.perTon >= 0 ? 'positive' : 'negative'} hint={`${hired.trips} рейсов, ${formatNumber(hired.ton, 1)} т`} />
        <StatCard label="Что выгоднее" value={better ? `${formatMoney(Math.abs(own.perTon - hired.perTon))}/т` : '—'} hint={better ?? 'нужны рейсы и своих, и наёмных машин'} />
      </div>
      <div className="mb-3 flex justify-end">
        <ExcelButton onClick={exportExcel} disabled={rows.length === 0} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        getRowId={(r) => `${r.type}-${r.label}`}
        searchable
        emptyMessage="Нет рейсов за период"
        footer={(vis) => {
          const t = vis.reduce((a, r) => ({ trips: a.trips + r.trips, ton: a.ton + r.tonnage, rev: a.rev + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit }), { trips: 0, ton: 0, rev: 0, cost: 0, profit: 0 });
          return ['Итого', '', t.trips, formatNumber(t.ton, 2), formatMoney(t.rev), formatMoney(t.cost), '', formatMoney(t.profit), t.ton ? formatMoney(t.profit / t.ton) : '—'];
        }}
      />
    </div>
  );
}
