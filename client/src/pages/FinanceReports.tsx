import { ArrowLeftRight, Boxes, Landmark, Lightbulb, Percent, TrendingUp, Truck, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { downloadStyledTable } from '@/lib/styledExcel';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ общие мелочи

const GREEN = '#10b981';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const AMBER = '#f59e0b';

const SOURCE_LABELS: Record<string, string> = { warehouse: 'Со склада', ticket: 'По тикетам', direct: 'Напрямую с завода' };
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1).replace('.', ',')}%` : '—');
const tone = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-destructive' : '');
const packLabel = (p: string | null) => (p ? (PACKAGING_LABELS[p as 'MESHOK' | 'NAVAL'] ?? p) : '');

/** 1 250 000 → «1,3 млн»: короткие подписи на осях графиков. */
function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')} млрд`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} млн`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} тыс`;
  return String(Math.round(v));
}

const tooltipStyle = { background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)', borderRadius: 8, fontSize: 13 };

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Вывод простыми словами — то, что нужно понять, не разбирая таблицу. */
function Insight({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'good' | 'bad' }) {
  return (
    <div
      className={cn(
        'mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed',
        kind === 'good' && 'border-emerald-600/30 bg-emerald-600/10',
        kind === 'bad' && 'border-destructive/30 bg-destructive/10',
        kind === 'info' && 'bg-muted/40',
      )}
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <div>{children}</div>
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{loading ? 'Загрузка…' : 'За выбранный период данных нет'}</p>;
}

function ExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      Скачать в Excel
    </Button>
  );
}

function AxisProps() {
  return { stroke: 'var(--muted-foreground)', tick: { fontSize: 12 } } as const;
}

/** Горизонтальные столбики «название — сумма»: цвет по знаку. */
function HBars({ data, height }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <div style={{ height: height ?? Math.max(160, data.length * 44 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tickFormatter={compact} domain={[(min: number) => Math.min(min, 0), (max: number) => max * 1.18]} {...AxisProps()} />
          <YAxis type="category" dataKey="name" width={150} {...AxisProps()} />
          <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? GREEN : RED} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v: number) => compact(v)} fill="var(--foreground)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function usePeriod() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return { from, to, setFrom, setTo, params: { from: from || undefined, to: to || undefined } };
}
type PeriodState = ReturnType<typeof usePeriod>;

const periodText = (p: PeriodState) => (p.from || p.to ? `период ${p.from || '…'} — ${p.to || '…'}` : 'за всё время');

/** Таблица-ведомость: строки — показатели, колонки — разрезы. */
function Statement({ title, columns, rows }: { title: string; columns: string[]; rows: { label: string; values: ReactNode[]; strong?: boolean; sign?: number[] }[] }) {
  return (
    <div className="mb-5 overflow-x-auto rounded-xl border">
      <div className="border-b bg-muted/50 px-4 py-2.5 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium" />
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

// ------------------------------------------------------------------ 1. Прибыли и убытки

function PnlSection({ period }: { period: PeriodState }) {
  const { notify } = useToast();
  const pnl = usePnl(period.params);
  const d = pnl.data;

  const m = useMemo(() => {
    if (!d) return null;
    const by = (s: string) => d.cement.find((r) => r.source === s) ?? { source: s, deals: 0, tonnage: 0, revenue: 0, cost: 0, margin: 0 };
    const cols = ['warehouse', 'ticket', 'direct'].map(by);
    const cement = cols.reduce(
      (a, r) => ({ deals: a.deals + r.deals, tonnage: a.tonnage + r.tonnage, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, margin: a.margin + r.margin }),
      { deals: 0, tonnage: 0, revenue: 0, cost: 0, margin: 0 },
    );
    const own = d.logistics.own;
    const hired = d.logistics.hired;
    const log = { trips: own.trips + hired.trips, tonnage: own.tonnage + hired.tonnage, revenue: own.revenue + hired.revenue, cost: own.cost + hired.cost };
    const logProfit = log.revenue - log.cost;
    const net = cement.margin + logProfit + d.other.cashServiceCommission - d.other.otherExpenses;
    return { cols, cement, own, hired, log, logProfit, net };
  }, [d]);

  async function exportExcel() {
    if (!m || !d) return;
    const rows: (string | number | null)[][] = [];
    const fills: (string | undefined)[] = [];
    const add = (section: string, label: string, value: number, fill?: string) => {
      rows.push([section, label, value]);
      fills.push(fill);
    };
    add('Торговля цементом', 'Выручка', m.cement.revenue);
    add('Торговля цементом', 'Себестоимость', m.cement.cost);
    add('Торговля цементом', 'Валовая прибыль', m.cement.margin, 'FFE6F4EA');
    for (const c of m.cols) if (c.deals) add('Торговля цементом', `  в т.ч. ${SOURCE_LABELS[c.source]} — прибыль`, c.margin);
    add('Логистика', 'Выручка (доставка клиентам)', m.log.revenue);
    add('Логистика', 'Расходы: наём перевозчиков', m.hired.cost);
    add('Логистика', 'Расходы: свои машины', m.own.cost);
    add('Логистика', 'Прибыль логистики', m.logProfit, 'FFE6F4EA');
    add('Итого', 'Выручка всего', m.cement.revenue + m.log.revenue);
    add('Итого', 'Комиссия обналичивания', d.other.cashServiceCommission);
    add('Итого', 'Прочие расходы', -d.other.otherExpenses);
    add('Итого', 'ЧИСТАЯ ПРИБЫЛЬ', m.net, 'FFFFF4E0');
    await downloadStyledTable({
      filename: 'Прибыли_и_убытки.xlsx',
      sheetName: 'P&L',
      title: 'Прибыли и убытки по направлениям',
      subtitle: periodText(period),
      columns: [
        { header: 'Направление', width: 24 },
        { header: 'Показатель', width: 40 },
        { header: 'Сумма, сум', width: 20, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows,
      rowFills: fills,
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  if (!m || !d) return <Empty loading={pnl.isLoading} />;

  const directionData = [
    { name: 'Цемент', Выручка: m.cement.revenue, Расходы: m.cement.cost, Прибыль: m.cement.margin },
    { name: 'Логистика', Выручка: m.log.revenue, Расходы: m.log.cost, Прибыль: m.logProfit },
  ];
  const contribution = [
    { name: 'Цемент', value: m.cement.margin },
    { name: 'Логистика', value: m.logProfit },
    { name: 'Комиссия обналичивания', value: d.other.cashServiceCommission },
    { name: 'Прочие расходы', value: -d.other.otherExpenses },
    { name: 'ЧИСТАЯ ПРИБЫЛЬ', value: m.net },
  ].filter((x) => x.value !== 0 || x.name === 'ЧИСТАЯ ПРИБЫЛЬ');
  const bestDirection = m.cement.margin >= m.logProfit ? 'цемент' : 'логистика';

  return (
    <div>
      <Insight kind={m.net >= 0 ? 'good' : 'bad'}>
        {periodText(period) === 'за всё время' ? 'За всё время' : `За ${periodText(period)}`} чистая прибыль — <b>{formatMoney(m.net)}</b>.{' '}
        {m.cement.revenue > 0 && (
          <>
            С каждых 100 сум, полученных за цемент, остаётся <b>{pct(m.cement.margin, m.cement.revenue).replace('%', '')} сум</b> прибыли.{' '}
          </>
        )}
        {m.log.revenue > 0 && (
          <>
            С каждых 100 сум за доставку — <b>{pct(m.logProfit, m.log.revenue).replace('%', '')} сум</b>.{' '}
          </>
        )}
        {m.cement.margin + m.logProfit > 0 && <>Больше всего прибыли приносит {bestDirection}.</>}
        {d.excludedHistorical > 0 && <span className="text-muted-foreground"> Загруженная история без себестоимости ({d.excludedHistorical} продаж) в цемент не входит.</span>}
      </Insight>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Прибыль от цемента" value={formatMoney(m.cement.margin)} tone={m.cement.margin >= 0 ? 'positive' : 'negative'} hint={`маржа ${pct(m.cement.margin, m.cement.revenue)} · продано ${formatNumber(m.cement.tonnage, 1)} т`} />
        <StatCard label="Прибыль от логистики" value={formatMoney(m.logProfit)} tone={m.logProfit >= 0 ? 'positive' : 'negative'} hint={`маржа ${pct(m.logProfit, m.log.revenue)} · ${m.log.trips} рейсов`} />
        <StatCard label="Чистая прибыль" value={formatMoney(m.net)} tone={m.net >= 0 ? 'positive' : 'negative'} hint="цемент + логистика + прочее" />
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Сколько зарабатываем и тратим" subtitle="Выручка, расходы и прибыль по направлениям">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={directionData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" {...AxisProps()} />
                <YAxis tickFormatter={compact} width={80} {...AxisProps()} />
                <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                <Legend />
                <Bar dataKey="Выручка" fill={BLUE} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Расходы" fill={AMBER} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Прибыль" fill={GREEN} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Из чего складывается чистая прибыль" subtitle="Зелёное — приносит деньги, красное — уменьшает прибыль">
          <HBars data={contribution} height={288} />
        </ChartCard>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Подробно по цифрам</h2>
        <ExcelButton onClick={exportExcel} />
      </div>
      <Statement
        title="Торговля цементом (склад, тикеты, напрямую с завода)"
        columns={['Со склада', 'По тикетам', 'Напрямую', 'Итого']}
        rows={[
          { label: 'Продаж', values: [...m.cols.map((c) => c.deals), m.cement.deals] },
          { label: 'Продано, т', values: [...m.cols.map((c) => formatNumber(c.tonnage, 2)), formatNumber(m.cement.tonnage, 2)] },
          { label: 'Выручка', values: [...m.cols.map((c) => formatMoney(c.revenue)), formatMoney(m.cement.revenue)] },
          { label: 'Себестоимость', values: [...m.cols.map((c) => formatMoney(c.cost)), formatMoney(m.cement.cost)] },
          { label: 'Валовая прибыль', strong: true, values: [...m.cols.map((c) => formatMoney(c.margin)), formatMoney(m.cement.margin)], sign: [...m.cols.map((c) => c.margin), m.cement.margin] },
          { label: 'Маржа, %', values: [...m.cols.map((c) => pct(c.margin, c.revenue)), pct(m.cement.margin, m.cement.revenue)] },
        ]}
      />
      <Statement
        title="Логистика (своя и наёмная техника)"
        columns={['Свои машины', 'Наёмные', 'Итого']}
        rows={[
          { label: 'Рейсов', values: [m.own.trips, m.hired.trips, m.log.trips] },
          { label: 'Перевезено, т', values: [formatNumber(m.own.tonnage, 2), formatNumber(m.hired.tonnage, 2), formatNumber(m.log.tonnage, 2)] },
          { label: 'Выручка (доставка клиентам)', values: [formatMoney(m.own.revenue), formatMoney(m.hired.revenue), formatMoney(m.log.revenue)] },
          { label: 'Расходы (свои машины / наём)', values: [formatMoney(m.own.cost), formatMoney(m.hired.cost), formatMoney(m.log.cost)] },
          {
            label: 'Прибыль логистики',
            strong: true,
            values: [formatMoney(m.own.revenue - m.own.cost), formatMoney(m.hired.revenue - m.hired.cost), formatMoney(m.logProfit)],
            sign: [m.own.revenue - m.own.cost, m.hired.revenue - m.hired.cost, m.logProfit],
          },
          { label: 'Маржа, %', values: [pct(m.own.revenue - m.own.cost, m.own.revenue), pct(m.hired.revenue - m.hired.cost, m.hired.revenue), pct(m.logProfit, m.log.revenue)] },
        ]}
      />
      <Statement
        title="Консолидированный итог"
        columns={['Сумма']}
        rows={[
          { label: 'Выручка: цемент', values: [formatMoney(m.cement.revenue)] },
          { label: 'Выручка: логистика', values: [formatMoney(m.log.revenue)] },
          { label: 'Прибыль от цемента', values: [formatMoney(m.cement.margin)], sign: [m.cement.margin] },
          { label: 'Прибыль логистики', values: [formatMoney(m.logProfit)], sign: [m.logProfit] },
          { label: 'Комиссия обналичивания', values: [formatMoney(d.other.cashServiceCommission)] },
          { label: 'Прочие расходы (категория «прочее» в кассе)', values: [`− ${formatMoney(d.other.otherExpenses)}`] },
          { label: 'Чистая прибыль', strong: true, values: [formatMoney(m.net)], sign: [m.net] },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Выручка и себестоимость — по продажам (начисление), а не по оплатам. Оплаты поставщикам, пополнение брокерского счёта и платежи клиентов — не расходы и не доходы, их видно в «Движении денег».
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ 2. Маржа по сделкам

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

function MarginsSection({ period }: { period: PeriodState }) {
  const { notify } = useToast();
  const report = useDealMargins(period.params);
  const rows = report.data ?? [];
  const markOf = (r: DealMargin) => `${r.mark ?? '—'}${r.packaging ? ` · ${packLabel(r.packaging)}` : ''}`;
  const byClient = useMemo(() => groupBy(rows, (r) => r.client_name), [rows]);
  const byMark = useMemo(() => groupBy(rows, markOf), [rows]);
  const total = rows.reduce((a, r) => ({ t: a.t + Number(r.tonnage), rev: a.rev + Number(r.revenue), cost: a.cost + Number(r.cost), m: a.m + Number(r.margin) }), { t: 0, rev: 0, cost: 0, m: 0 });
  const losing = rows.filter((r) => Number(r.margin) < 0);
  const best = [...rows].sort((a, b) => Number(b.margin) - Number(a.margin))[0];
  const weakest = [...rows].sort((a, b) => Number(a.margin) / (Number(a.revenue) || 1) - Number(b.margin) / (Number(b.revenue) || 1))[0];

  const dealColumns: Column<DealMargin>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'client_name', header: 'Клиент', sortValue: (r) => r.client_name },
    { key: 'mark', header: 'Марка', sortValue: markOf, render: markOf },
    { key: 'source', header: 'Источник', sortValue: (r) => SOURCE_LABELS[r.source] ?? r.source, render: (r) => SOURCE_LABELS[r.source] ?? r.source },
    { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => formatNumber(r.tonnage, 3) },
    { key: 'price_per_ton', header: 'Продали по', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton) },
    { key: 'cost_per_ton', header: 'Себестоимость', align: 'right', sortValue: (r) => Number(r.cost_per_ton), render: (r) => formatMoney(r.cost_per_ton) },
    { key: 'margin', header: 'Заработали', align: 'right', sortValue: (r) => Number(r.margin), render: (r) => <span className={cn('font-medium', tone(Number(r.margin)))}>{formatMoney(r.margin)}</span> },
    { key: 'margin_pct', header: 'Маржа', align: 'right', sortValue: (r) => (Number(r.revenue) ? Number(r.margin) / Number(r.revenue) : 0), render: (r) => pct(Number(r.margin), Number(r.revenue)) },
  ];
  const groupColumns = (title: string): Column<Group>[] => [
    { key: 'name', header: title, sortValue: (g) => g.name },
    { key: 'deals', header: 'Сделок', align: 'right', sortValue: (g) => g.deals },
    { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (g) => g.tonnage, render: (g) => formatNumber(g.tonnage, 2) },
    { key: 'revenue', header: 'Выручка', align: 'right', sortValue: (g) => g.revenue, render: (g) => formatMoney(g.revenue) },
    { key: 'cost', header: 'Себестоимость', align: 'right', sortValue: (g) => g.cost, render: (g) => formatMoney(g.cost) },
    { key: 'margin', header: 'Заработали', align: 'right', sortValue: (g) => g.margin, render: (g) => <span className={cn('font-medium', tone(g.margin))}>{formatMoney(g.margin)}</span> },
    { key: 'pct', header: 'Маржа', align: 'right', sortValue: (g) => (g.revenue ? g.margin / g.revenue : 0), render: (g) => pct(g.margin, g.revenue) },
  ];
  const groupFooter = (vis: Group[]) => {
    const t = vis.reduce((a, g) => ({ d: a.d + g.deals, t: a.t + g.tonnage, rev: a.rev + g.revenue, c: a.c + g.cost, m: a.m + g.margin }), { d: 0, t: 0, rev: 0, c: 0, m: 0 });
    return ['Итого', t.d, formatNumber(t.t, 2), formatMoney(t.rev), formatMoney(t.c), formatMoney(t.m), pct(t.m, t.rev)];
  };

  async function exportExcel() {
    await downloadStyledTable({
      filename: 'Маржа_по_сделкам.xlsx',
      sheetName: 'Маржа по сделкам',
      title: 'Маржа по сделкам',
      subtitle: `цемент: цена продажи − себестоимость · ${periodText(period)}`,
      summary: [
        ['Выручка по цементу, сум', total.rev, '#,##0'],
        ['Себестоимость, сум', total.cost, '#,##0'],
        ['Маржа, сум', total.m, '#,##0;[Red]-#,##0'],
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
        markOf(r),
        SOURCE_LABELS[r.source] ?? r.source,
        Number(r.tonnage),
        Number(r.price_per_ton),
        Number(r.cost_per_ton),
        Number(r.revenue),
        Number(r.cost),
        Number(r.margin),
        Number(r.revenue) ? Number(r.margin) / Number(r.revenue) : 0,
      ]),
      totals: ['ИТОГО', '', '', '', total.t, null, null, total.rev, total.cost, total.m, total.rev ? total.m / total.rev : 0],
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  if (rows.length === 0) return <Empty loading={report.isLoading} />;
  const topClients = byClient.slice(0, 8).map((g) => ({ name: g.name, value: g.margin }));
  const marks = byMark.map((g) => ({ name: g.name, value: g.margin }));

  return (
    <div>
      <Insight kind={losing.length > 0 ? 'bad' : 'good'}>
        Средняя маржа по цементу — <b>{pct(total.m, total.rev)}</b>: с каждых 100 сум продажи остаётся {pct(total.m, total.rev).replace('%', '')} сум.{' '}
        {losing.length > 0 ? (
          <>
            <b>{losing.length} {losing.length === 1 ? 'сделка продана' : 'сделок продано'} в убыток</b> — их видно в таблице красным.{' '}
          </>
        ) : (
          <>Убыточных сделок нет. </>
        )}
        {best && (
          <>
            Самая прибыльная — {best.client_name}, {formatDate(best.date)}: {formatMoney(best.margin)}.{' '}
          </>
        )}
        {weakest && weakest !== best && (
          <>
            Самая слабая по марже — {weakest.client_name}, {formatDate(weakest.date)}: {pct(Number(weakest.margin), Number(weakest.revenue))}.
          </>
        )}
      </Insight>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Продали цемента на" value={formatMoney(total.rev)} hint={`${rows.length} сделок · ${formatNumber(total.t, 1)} т`} />
        <StatCard label="Он нам обошёлся в" value={formatMoney(total.cost)} hint="себестоимость" />
        <StatCard label="Заработали" value={formatMoney(total.m)} tone={total.m >= 0 ? 'positive' : 'negative'} hint={`маржа ${pct(total.m, total.rev)}`} />
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="На каких клиентах зарабатываем больше всего" subtitle="Маржа по клиентам, до 8 лучших">
          <HBars data={topClients} />
        </ChartCard>
        <ChartCard title="Какие марки выгоднее" subtitle="Маржа по маркам и упаковке">
          <HBars data={marks} />
        </ChartCard>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Подробно</h2>
        <ExcelButton onClick={exportExcel} />
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
            footer={(vis) => {
              const t = vis.reduce((a, r) => ({ t: a.t + Number(r.tonnage), rev: a.rev + Number(r.revenue), m: a.m + Number(r.margin) }), { t: 0, rev: 0, m: 0 });
              return ['Итого', '', '', '', formatNumber(t.t, 3), '', '', formatMoney(t.m), pct(t.m, t.rev)];
            }}
          />
        </TabsContent>
        <TabsContent value="clients" className="mt-3">
          <DataTable columns={groupColumns('Клиент')} rows={byClient} getRowId={(g) => g.key} searchable footer={groupFooter} />
        </TabsContent>
        <TabsContent value="marks" className="mt-3">
          <DataTable columns={groupColumns('Марка')} rows={byMark} getRowId={(g) => g.key} footer={groupFooter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ 3. Движение денег

const INCOME_LABELS: Record<string, string> = {
  цемент: 'Оплаты за цемент',
  логистика: 'Оплаты за логистику',
  возврат_биржи: 'Возврат с биржи (тикеты)',
  прочее: 'Прочие поступления',
};
const EXPENSE_LABELS: Record<string, string> = {
  цемент: 'Оплата поставщикам',
  логистика: 'Расходы на транспорт',
  перевозчик: 'Оплата перевозчикам',
  прочее: 'Прочие расходы',
  обналичивание: 'Выдача наличных',
  брокер: 'Пополнение брокерского счёта',
  контрагент: 'Выплаты клиентам-поставщикам',
};

function CashFlowSection({ period }: { period: PeriodState }) {
  const { notify } = useToast();
  const flow = useCashFlow(period.params);
  const d = flow.data;

  const calc = useMemo(() => {
    if (!d) return null;
    const sum = (rows: { UZS: number; USD: number }[], c: 'UZS' | 'USD') => rows.reduce((s, r) => s + r[c], 0);
    return { inUZS: sum(d.income, 'UZS'), inUSD: sum(d.income, 'USD'), outUZS: sum(d.expense, 'UZS'), outUSD: sum(d.expense, 'USD') };
  }, [d]);

  async function exportExcel() {
    if (!d || !calc) return;
    type L = { label: string; UZS: number | null; USD: number | null; fill?: string };
    const lines: L[] = [
      { label: 'Остаток на начало периода', ...d.opening, fill: 'FFF3F4F6' },
      { label: 'ПОСТУПЛЕНИЯ', UZS: null, USD: null, fill: 'FFEDEDED' },
      ...d.income.map((r) => ({ label: INCOME_LABELS[r.category] ?? r.category, UZS: r.UZS, USD: r.USD })),
      { label: 'Итого поступлений', UZS: calc.inUZS, USD: calc.inUSD, fill: 'FFF3F4F6' },
      { label: 'ВЫБЫТИЯ', UZS: null, USD: null, fill: 'FFEDEDED' },
      ...d.expense.map((r) => ({ label: EXPENSE_LABELS[r.category] ?? r.category, UZS: r.UZS, USD: r.USD })),
      { label: 'Итого выбытий', UZS: calc.outUZS, USD: calc.outUSD, fill: 'FFF3F4F6' },
      { label: 'Чистое движение за период', UZS: calc.inUZS - calc.outUZS, USD: calc.inUSD - calc.outUSD, fill: 'FFF3F4F6' },
      { label: 'Остаток на конец периода', ...d.closing, fill: 'FFFFF4E0' },
    ];
    await downloadStyledTable({
      filename: 'Движение_денег.xlsx',
      sheetName: 'ДДС',
      title: 'Движение денежных средств',
      subtitle: periodText(period),
      columns: [
        { header: 'Статья', width: 42 },
        { header: 'Сум', width: 20, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        { header: 'Доллары, $', width: 16, fmt: '#,##0;[Red]-#,##0', align: 'right' },
      ],
      rows: lines.map((l) => [l.label, l.UZS, l.USD]),
      rowFills: lines.map((l) => l.fill),
    }).catch(() => notify('Не удалось сформировать файл', 'error'));
  }

  if (!d || !calc) return <Empty loading={flow.isLoading} />;
  const net = calc.inUZS - calc.outUZS;
  const topExpense = [...d.expense].sort((a, b) => b.UZS - a.UZS)[0];
  const hasUsd = d.opening.USD !== 0 || calc.inUSD !== 0 || calc.outUSD !== 0 || d.closing.USD !== 0;
  const incomeData = d.income.filter((r) => r.UZS > 0).map((r) => ({ name: INCOME_LABELS[r.category] ?? r.category, value: r.UZS }));
  const expenseData = d.expense.filter((r) => r.UZS > 0).map((r) => ({ name: EXPENSE_LABELS[r.category] ?? r.category, value: -r.UZS }));

  const row = (label: string, uzs: number, usd: number, kind: 'item' | 'total' | 'result' = 'item') => (
    <tr key={label} className={cn('border-b last:border-0', kind === 'total' && 'font-medium', kind === 'result' && 'bg-muted/30 font-semibold')}>
      <td className={cn('px-4 py-2', kind === 'item' && 'pl-8')}>{label}</td>
      <td className={cn('px-4 py-2 text-right tabular-nums', kind !== 'item' && tone(uzs))}>{formatMoney(uzs)}</td>
      <td className={cn('px-4 py-2 text-right tabular-nums', kind !== 'item' && tone(usd))}>{formatMoney(usd, 'USD')}</td>
    </tr>
  );

  return (
    <div>
      <Insight kind={net >= 0 ? 'good' : 'bad'}>
        За период в кассу поступило <b>{formatMoney(calc.inUZS)}</b>, а ушло <b>{formatMoney(calc.outUZS)}</b> — {net >= 0 ? 'денег стало больше на' : 'денег стало меньше на'} <b>{formatMoney(Math.abs(net))}</b>.
        {topExpense && topExpense.UZS > 0 && (
          <>
            {' '}Больше всего ушло на «{EXPENSE_LABELS[topExpense.category] ?? topExpense.category}»: {formatMoney(topExpense.UZS)}.
          </>
        )}
        {hasUsd && <> Доллары учитываются отдельно (внизу).</>}
      </Insight>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Было в кассе на начало" value={formatMoney(d.opening.UZS)} />
        <StatCard label="Поступило" value={formatMoney(calc.inUZS)} tone="positive" />
        <StatCard label="Ушло" value={formatMoney(calc.outUZS)} tone="negative" />
        <StatCard label="Стало в кассе" value={formatMoney(d.closing.UZS)} tone={d.closing.UZS >= 0 ? 'default' : 'negative'} hint={hasUsd ? `и ${formatMoney(d.closing.USD, 'USD')}` : undefined} />
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Откуда приходят деньги" subtitle="Поступления в сумах по статьям">
          {incomeData.length > 0 ? <HBars data={incomeData} /> : <p className="py-6 text-sm text-muted-foreground">Поступлений нет</p>}
        </ChartCard>
        <ChartCard title="Куда уходят деньги" subtitle="Выбытия в сумах по статьям">
          {expenseData.length > 0 ? <HBars data={expenseData} /> : <p className="py-6 text-sm text-muted-foreground">Расходов нет</p>}
        </ChartCard>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Подробно по статьям</h2>
        <ExcelButton onClick={exportExcel} />
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Статья</th>
              <th className="px-4 py-2 text-right font-medium">Сум</th>
              <th className="px-4 py-2 text-right font-medium">Доллары</th>
            </tr>
          </thead>
          <tbody>
            {row('Остаток на начало периода', d.opening.UZS, d.opening.USD, 'total')}
            <tr className="bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground">
              <td className="px-4 py-1.5" colSpan={3}>
                ПОСТУПЛЕНИЯ
              </td>
            </tr>
            {d.income.map((r) => row(INCOME_LABELS[r.category] ?? r.category, r.UZS, r.USD))}
            {row('Итого поступлений', calc.inUZS, calc.inUSD, 'total')}
            <tr className="bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground">
              <td className="px-4 py-1.5" colSpan={3}>
                ВЫБЫТИЯ
              </td>
            </tr>
            {d.expense.map((r) => row(EXPENSE_LABELS[r.category] ?? r.category, r.UZS, r.USD))}
            {row('Итого выбытий', calc.outUZS, calc.outUSD, 'total')}
            {row('Чистое движение за период', calc.inUZS - calc.outUZS, calc.inUSD - calc.outUSD, 'total')}
            {row('Остаток на конец периода', d.closing.UZS, d.closing.USD, 'result')}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Сумы и доллары считаются отдельно, без пересчёта по курсу. Остаток на начало — всё, что было в кассе до начала периода.</p>
    </div>
  );
}

// ------------------------------------------------------------------ 4. Брокерский счёт

const BROKER_LABELS = { replenish: 'Пополнение', ticket_purchase: 'Покупка тикета', ticket_return: 'Возврат остатка тикета' } as const;

function BrokerSection({ period }: { period: PeriodState }) {
  const { notify } = useToast();
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
      render: (r) => (
        <span className={r.type === 'ticket_purchase' ? 'text-destructive' : 'text-emerald-600'}>
          {r.type === 'ticket_purchase' ? '−' : '+'}
          {formatMoney(r.amount)}
        </span>
      ),
    },
    { key: 'balance', header: 'Остаток после', align: 'right', render: (r) => formatMoney(r.balance) },
  ];

  async function exportExcel() {
    if (!d) return;
    await downloadStyledTable({
      filename: 'Брокерский_счёт.xlsx',
      sheetName: 'Брокерский счёт',
      title: 'Выписка по брокерскому счёту',
      subtitle: periodText(period),
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

  if (!d) return <Empty loading={report.isLoading} />;
  const chart = [{ name: 'Начало', balance: d.opening }, ...rows.map((r) => ({ name: formatDate(r.date), balance: r.balance }))];

  return (
    <div>
      <Insight kind="info">
        На брокерском счёте сейчас <b>{formatMoney(d.currentBalance)}</b>. За выбранный период на него положили <b>{formatMoney(d.replenish)}</b>, потратили на тикеты <b>{formatMoney(d.purchases)}</b>
        {d.returns > 0 && <>, вернулось <b>{formatMoney(d.returns)}</b></>}. Остаток на конец периода должен совпасть с тем, что показывает личный кабинет брокера — так удобно сверяться.
      </Insight>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Было на начало" value={formatMoney(d.opening)} />
        <StatCard label="Пополнили" value={formatMoney(d.replenish)} tone="positive" />
        <StatCard label="Потратили на тикеты" value={formatMoney(d.purchases)} tone="negative" hint={d.returns > 0 ? `вернулось ${formatMoney(d.returns)}` : undefined} />
        <StatCard label="Стало на конец" value={formatMoney(d.closing)} hint={`сейчас на счёте: ${formatMoney(d.currentBalance)}`} />
      </div>
      {rows.length > 0 && (
        <ChartCard title="Как менялся остаток на счёте" subtitle="Остаток после каждой операции" className="mb-5">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: 0, right: 12 }}>
                <defs>
                  <linearGradient id="brokerFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" {...AxisProps()} />
                <YAxis tickFormatter={compact} width={80} {...AxisProps()} />
                <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} />
                <Area type="stepAfter" dataKey="balance" name="Остаток" stroke={BLUE} strokeWidth={2} fill="url(#brokerFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Выписка по операциям</h2>
        <ExcelButton onClick={exportExcel} />
      </div>
      <DataTable columns={columns} rows={rows} loading={report.isLoading} getRowId={(r) => r.id} emptyMessage="Нет операций за период" />
    </div>
  );
}

// ------------------------------------------------------------------ 5. Остатки

function StockSection() {
  const { notify } = useToast();
  const stock = useStockReport();
  const d = stock.data;
  const whValue = (d?.warehouse ?? []).reduce((s, r) => s + r.value, 0);
  const tkValue = (d?.tickets ?? []).reduce((s, r) => s + r.value, 0);
  const whTon = (d?.warehouse ?? []).reduce((s, r) => s + r.tonnage, 0);
  const tkTon = (d?.tickets ?? []).reduce((s, r) => s + r.tonnage, 0);

  const byMark = useMemo(() => {
    const map = new Map<string, { name: string; Склад: number; Тикеты: number }>();
    for (const r of d?.warehouse ?? []) {
      const key = `${r.mark} · ${packLabel(r.packaging)}`;
      const g = map.get(key) ?? { name: key, Склад: 0, Тикеты: 0 };
      g.Склад += r.value;
      map.set(key, g);
    }
    for (const r of d?.tickets ?? []) {
      const key = `${r.mark} · ${packLabel(r.packaging)}`;
      const g = map.get(key) ?? { name: key, Склад: 0, Тикеты: 0 };
      g.Тикеты += r.value;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.Склад + b.Тикеты - (a.Склад + a.Тикеты));
  }, [d]);

  async function exportExcel() {
    if (!d) return;
    const rows: (string | number | null)[][] = [
      ...d.warehouse.map((r) => ['Склад', r.zavod_name, r.mark, packLabel(r.packaging), '', r.tonnage, r.avg_cost_per_ton, r.value]),
      ...d.tickets.map((r) => ['Тикет', r.zavod_name, r.mark, packLabel(r.packaging), r.ticket_number, r.tonnage, r.price_per_ton, r.value]),
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

  if (!d) return <Empty loading={stock.isLoading} />;
  const pie = [
    { name: 'Склад', value: whValue },
    { name: 'Тикеты', value: tkValue },
  ].filter((x) => x.value > 0);

  return (
    <div>
      <Insight kind="info">
        Сейчас в цементе «заморожено» <b>{formatMoney(whValue + tkValue)}</b> ({formatNumber(whTon + tkTon, 1)} т): на складе — {formatMoney(whValue)} ({formatNumber(whTon, 1)} т), в тикетах —{' '}
        {formatMoney(tkValue)} ({formatNumber(tkTon, 1)} т). Склад оценён по средней себестоимости, тикеты — по цене покупки. Остатки показаны на сегодня.
      </Insight>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="На складе" value={formatMoney(whValue)} hint={`${formatNumber(whTon, 2)} т`} />
        <StatCard label="В тикетах" value={formatMoney(tkValue)} hint={`${formatNumber(tkTon, 2)} т`} />
        <StatCard label="Всего в товаре" value={formatMoney(whValue + tkValue)} hint={`${formatNumber(whTon + tkTon, 2)} т`} />
      </div>
      <div className="mb-5 grid gap-4 xl:grid-cols-5">
        <ChartCard title="Где лежат деньги" className="xl:col-span-2">
          {pie.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {pie.map((p, i) => (
                      <Cell key={i} fill={p.name === 'Склад' ? AMBER : BLUE} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">Остатков нет</p>
          )}
        </ChartCard>
        <ChartCard title="По маркам" subtitle="Стоимость остатков: склад и тикеты" className="xl:col-span-3">
          <div style={{ height: Math.max(200, byMark.length * 52 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMark} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickFormatter={compact} {...AxisProps()} />
                <YAxis type="category" dataKey="name" width={130} {...AxisProps()} />
                <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                <Legend />
                <Bar dataKey="Склад" stackId="a" fill={AMBER} />
                <Bar dataKey="Тикеты" stackId="a" fill={BLUE} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Подробно</h2>
        <ExcelButton onClick={exportExcel} />
      </div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Склад (Факт)</h3>
      <div className="mb-5">
        <DataTable
          columns={[
            { key: 'zavod_name', header: 'Поставщик', sortValue: (r) => r.zavod_name },
            { key: 'mark', header: 'Марка', sortValue: (r) => r.mark },
            { key: 'packaging', header: 'Упаковка', render: (r) => packLabel(r.packaging) },
            { key: 'tonnage', header: 'Тонн', align: 'right', sortValue: (r) => r.tonnage, render: (r) => formatNumber(r.tonnage, 3) },
            { key: 'avg_cost_per_ton', header: 'Себестоимость/т', align: 'right', render: (r) => formatMoney(r.avg_cost_per_ton) },
            { key: 'value', header: 'Стоимость', align: 'right', sortValue: (r) => r.value, render: (r) => formatMoney(r.value) },
          ]}
          rows={d.warehouse}
          getRowId={(r) => `${r.zavod_name}-${r.mark}-${r.packaging}`}
          emptyMessage="Склад пуст"
          footer={['Итого', '', '', formatNumber(whTon, 3), '', formatMoney(whValue)]}
        />
      </div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Тикеты (активные)</h3>
      <DataTable
        columns={[
          { key: 'ticket_number', header: 'Тикет', sortValue: (r) => r.ticket_number },
          { key: 'zavod_name', header: 'Поставщик', sortValue: (r) => r.zavod_name },
          { key: 'mark', header: 'Марка', sortValue: (r) => r.mark },
          { key: 'packaging', header: 'Упаковка', render: (r) => packLabel(r.packaging) },
          { key: 'tonnage', header: 'Остаток, т', align: 'right', sortValue: (r) => r.tonnage, render: (r) => formatNumber(r.tonnage, 3) },
          { key: 'price_per_ton', header: 'Цена покупки/т', align: 'right', render: (r) => formatMoney(r.price_per_ton) },
          { key: 'value', header: 'Стоимость', align: 'right', sortValue: (r) => r.value, render: (r) => formatMoney(r.value) },
        ]}
        rows={d.tickets}
        getRowId={(r) => r.ticket_number}
        emptyMessage="Активных тикетов нет"
        footer={['Итого', '', '', '', formatNumber(tkTon, 3), '', formatMoney(tkValue)]}
      />
    </div>
  );
}

// ------------------------------------------------------------------ 6. Машины и рейсы

function MachinesSection({ period }: { period: PeriodState }) {
  const { notify } = useToast();
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
      subtitle: periodText(period),
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

  if (rows.length === 0) return <Empty loading={report.isLoading} />;
  const bothKinds = own.ton > 0 && hired.ton > 0;
  const ownBetter = own.perTon > hired.perTon;
  const profitData = rows.slice(0, 10).map((r) => ({ name: r.label, value: r.profit }));
  const perTonData = [
    { name: 'Своя машина', value: own.perTon },
    { name: 'Наёмная', value: hired.perTon },
  ].filter((x) => (x.name === 'Своя машина' ? own.ton > 0 : hired.ton > 0));

  return (
    <div>
      <Insight kind="info">
        {bothKinds ? (
          <>
            Доставка на <b>{ownBetter ? 'своей машине' : 'наёмной'}</b> выгоднее: она даёт на <b>{formatMoney(Math.abs(own.perTon - hired.perTon))}</b> больше прибыли с каждой тонны ({formatMoney(own.perTon)} против {formatMoney(hired.perTon)}).{' '}
          </>
        ) : (
          <>Чтобы сравнить свои и наёмные машины, нужны рейсы и тех, и других. </>
        )}
        Расходы своих машин берутся из кассы (категория «Расходы на транспорт» с номером машины: топливо, ремонт). Амортизацию или аренду вносите туда же — они сразу попадут в отчёт.
      </Insight>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Своя: прибыль на тонну" value={own.ton ? formatMoney(own.perTon) : '—'} tone={own.perTon >= 0 ? 'positive' : 'negative'} hint={`${own.trips} рейсов · ${formatNumber(own.ton, 1)} т`} />
        <StatCard label="Наёмная: прибыль на тонну" value={hired.ton ? formatMoney(hired.perTon) : '—'} tone={hired.perTon >= 0 ? 'positive' : 'negative'} hint={`${hired.trips} рейсов · ${formatNumber(hired.ton, 1)} т`} />
        <StatCard label="Всего заработали на доставке" value={formatMoney(own.profit + hired.profit)} tone={own.profit + hired.profit >= 0 ? 'positive' : 'negative'} hint={`${own.trips + hired.trips} рейсов`} />
      </div>
      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Сколько приносит каждая машина" subtitle="Прибыль за период: выручка минус расходы">
          <HBars data={profitData} />
        </ChartCard>
        <ChartCard title="Прибыль на одну тонну" subtitle="Своя машина против наёмной">
          <HBars data={perTonData} height={170} />
        </ChartCard>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Подробно по машинам</h2>
        <ExcelButton onClick={exportExcel} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        getRowId={(r) => `${r.type}-${r.label}`}
        searchable
        footer={(vis) => {
          const t = vis.reduce((a, r) => ({ trips: a.trips + r.trips, ton: a.ton + r.tonnage, rev: a.rev + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit }), { trips: 0, ton: 0, rev: 0, cost: 0, profit: 0 });
          return ['Итого', '', t.trips, formatNumber(t.ton, 2), formatMoney(t.rev), formatMoney(t.cost), '', formatMoney(t.profit), t.ton ? formatMoney(t.profit / t.ton) : '—'];
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Страница

const SECTIONS: { key: string; label: string; hint: string; icon: LucideIcon; usesPeriod: boolean }[] = [
  { key: 'pnl', label: 'Прибыли и убытки', hint: 'Сколько заработали на цементе и логистике', icon: TrendingUp, usesPeriod: true },
  { key: 'margins', label: 'Маржа по сделкам', hint: 'На ком и на чём зарабатываем', icon: Percent, usesPeriod: true },
  { key: 'cashflow', label: 'Движение денег', hint: 'Откуда пришли деньги и куда ушли', icon: ArrowLeftRight, usesPeriod: true },
  { key: 'broker', label: 'Брокерский счёт', hint: 'Выписка для сверки с брокером', icon: Landmark, usesPeriod: true },
  { key: 'stock', label: 'Остатки', hint: 'Сколько денег лежит в цементе', icon: Boxes, usesPeriod: false },
  { key: 'machines', label: 'Машины и рейсы', hint: 'Прибыль на машину, своя или наёмная', icon: Truck, usesPeriod: true },
];

/** Подстраница «Финансовые отчёты» внутри «Отчётов»: меню слева, общий выбор периода, в каждом отчёте — вывод
 * простыми словами, крупные показатели, графики и подробная таблица с выгрузкой в Excel. */
export function FinanceReports() {
  const { section } = useParams();
  const navigate = useNavigate();
  const period = usePeriod();
  const current = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <div>
      <Link to="/reports" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Отчёты
      </Link>
      <PageHeader title="Финансовые отчёты" subtitle="Прибыль, маржа, деньги, брокерский счёт, остатки и машины — наглядно" />

      <div className="grid gap-6 md:grid-cols-[230px_1fr]">
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          {SECTIONS.map((s) => {
            const active = s.key === current.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => navigate(`/reports/finance/${s.key}`)}
                className={cn(
                  'flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors md:w-full',
                  active ? 'border-primary bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <s.icon className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium whitespace-nowrap md:whitespace-normal">{s.label}</span>
                  <span className="hidden text-xs text-muted-foreground md:block">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{current.label}</h2>
            <p className="text-sm text-muted-foreground">{current.hint}</p>
          </div>
          {current.usesPeriod && <FilterBar from={period.from} to={period.to} onFromChange={period.setFrom} onToChange={period.setTo} />}
          {current.key === 'pnl' && <PnlSection period={period} />}
          {current.key === 'margins' && <MarginsSection period={period} />}
          {current.key === 'cashflow' && <CashFlowSection period={period} />}
          {current.key === 'broker' && <BrokerSection period={period} />}
          {current.key === 'stock' && <StockSection />}
          {current.key === 'machines' && <MachinesSection period={period} />}
        </div>
      </div>
    </div>
  );
}
