import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCashBalances, useDebtsSummary, useReportSummary } from '@/api/modules';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

const LOW_STOCK_THRESHOLD = 20;

export function Dashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const summary = useReportSummary({ from: from || undefined, to: to || undefined });
  const debts = useDebtsSummary();
  const cashBalances = useCashBalances();
  const data = summary.data;

  const chartData = (data?.dailyTrend ?? []).map((d) => ({ date: formatDate(d.date), total: Number(d.total) }));
  const lowStock = (data?.warehouseBalance ?? []).filter((b) => Number(b.tonnage) < LOW_STOCK_THRESHOLD);

  return (
    <div>
      <PageHeader
        title="Панель"
        subtitle="Обзор бизнеса"
        action={
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Наличные" value={formatMoney(cashBalances.data?.наличка ?? 0)} />
        <StatCard label="Карта" value={formatMoney(cashBalances.data?.карта ?? 0)} />
        <StatCard label="Перевод" value={formatMoney(cashBalances.data?.перечисление ?? 0)} />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Взаиморасчёты</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <DebtCard
          title="Должны нам клиенты"
          total={debts.data?.clientDebtTotal ?? 0}
          items={(debts.data?.topClients ?? []).map((c) => ({
            key: c.id,
            label: c.name,
            value: c.balance,
            href: `/clients/${c.id}`,
          }))}
        />
        <DebtCard
          title="Должны мы заводам"
          total={debts.data?.zavodDebtTotal ?? 0}
          items={(debts.data?.topZavody ?? []).map((z) => ({
            key: z.id,
            label: z.name,
            value: z.balance,
            href: `/zavody/${z.id}`,
          }))}
        />
        <DebtCard
          title="Должны мы перевозчикам"
          total={debts.data?.carrierDebtTotal ?? 0}
          items={(debts.data?.topCarriers ?? []).map((c) => ({ key: c.name, label: c.name, value: c.balance }))}
        />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Оборот" value={formatMoney(data?.revenue ?? 0)} hint={`${data?.salesCount ?? 0} продаж`} />
        <StatCard label="Прибыль (маржа)" value={formatMoney(data?.profit ?? 0)} tone="positive" />
        <StatCard label="Приход кассы" value={formatMoney(data?.cashIn ?? 0)} />
        <StatCard label="Расход кассы" value={formatMoney(data?.cashOut ?? 0)} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Баланс биржи" value={formatMoney(data?.brokerBalance ?? 0)} />
        <StatCard label="Позиций на складе" value={String(data?.warehouseBalance.length ?? 0)} />
        <StatCard
          label="Мало на складе (< 20т)"
          value={String(lowStock.length)}
          tone={lowStock.length > 0 ? 'negative' : 'default'}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Динамика продаж</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatNumber(v)}
                />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Топ клиентов</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(data?.topClients ?? []).map((c) => (
                <li key={c.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-medium tabular-nums">{formatMoney(c.total)}</span>
                </li>
              ))}
              {(data?.topClients ?? []).length === 0 && <li className="text-sm text-muted-foreground">Нет данных</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Топ марок</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(data?.topMarks ?? []).map((m) => (
                <li key={m.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{m.name}</span>
                  <span className="font-medium tabular-nums">{formatNumber(m.tonnage, 2)} т</span>
                </li>
              ))}
              {(data?.topMarks ?? []).length === 0 && <li className="text-sm text-muted-foreground">Нет данных</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm text-amber-600">Низкий остаток на складе</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {lowStock.map((b) => (
                <li key={b.id}>
                  {b.zavod_name} · {b.cement_mark_name} ({PACKAGING_LABELS[b.packaging]}) — {formatNumber(b.tonnage, 2)} т
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DebtCard({
  title,
  total,
  items,
}: {
  title: string;
  total: number;
  items: { key: string | number; label: string; value: string; href?: string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${total > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
          {formatMoney(total)}
        </CardTitle>
      </CardHeader>
      {items.length > 0 && (
        <CardContent className="pt-0">
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li key={it.key} className="flex justify-between gap-2 text-sm">
                {it.href ? (
                  <Link to={it.href} className="truncate text-muted-foreground hover:text-foreground hover:underline">
                    {it.label}
                  </Link>
                ) : (
                  <span className="truncate text-muted-foreground">{it.label}</span>
                )}
                <span className="shrink-0 font-medium tabular-nums">{formatMoney(it.value)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
