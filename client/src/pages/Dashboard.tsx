import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { Input } from '../components/form';
import { useReportSummary } from '../api/modules';
import { formatDate, formatMoney, formatNumber } from '../lib/format';

const LOW_STOCK_THRESHOLD = 20;

export function Dashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const summary = useReportSummary({ from: from || undefined, to: to || undefined });
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
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-36" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-36" />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard label="Оборот" value={formatMoney(data?.revenue ?? 0)} hint={`${data?.salesCount ?? 0} продаж`} />
        <StatCard label="Прибыль (маржа)" value={formatMoney(data?.profit ?? 0)} tone="positive" />
        <StatCard label="Приход кассы" value={formatMoney(data?.cashIn ?? 0)} />
        <StatCard label="Расход кассы" value={formatMoney(data?.cashOut ?? 0)} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Баланс биржи" value={formatMoney(data?.brokerBalance ?? 0)} />
        <StatCard label="Позиций на складе" value={String(data?.warehouseBalance.length ?? 0)} />
        <StatCard label="Мало на складе (< 20т)" value={String(lowStock.length)} tone={lowStock.length > 0 ? 'negative' : 'default'} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Динамика продаж</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatNumber(v)} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Топ клиентов</h2>
          <ul className="space-y-2">
            {(data?.topClients ?? []).map((c) => (
              <li key={c.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{c.name}</span>
                <span className="font-medium text-slate-900">{formatMoney(c.total)}</span>
              </li>
            ))}
            {(data?.topClients ?? []).length === 0 && <li className="text-sm text-slate-400">Нет данных</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Топ марок</h2>
          <ul className="space-y-2">
            {(data?.topMarks ?? []).map((m) => (
              <li key={m.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{m.name}</span>
                <span className="font-medium text-slate-900">{formatNumber(m.tonnage, 2)} т</span>
              </li>
            ))}
            {(data?.topMarks ?? []).length === 0 && <li className="text-sm text-slate-400">Нет данных</li>}
          </ul>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">⚠️ Низкий остаток на складе</h2>
          <ul className="space-y-1 text-sm text-amber-800">
            {lowStock.map((b) => (
              <li key={b.id}>
                {b.cement_mark_name} ({b.type}) — {formatNumber(b.tonnage, 2)} т
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
