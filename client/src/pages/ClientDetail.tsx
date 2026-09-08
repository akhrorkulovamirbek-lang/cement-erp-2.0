import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { clientsHooks, salesHooks, cashIncomeHooks, useClientBalances } from '../api/modules';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import type { CashIncome, Sale } from '../types';

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);

  const clients = clientsHooks.useList();
  const balances = useClientBalances();
  const sales = salesHooks.useList({ client_id: clientId });
  const payments = cashIncomeHooks.useList({ client_id: clientId });

  const client = clients.data?.find((c) => c.id === clientId);
  const balance = balances.data?.find((b) => b.id === clientId);

  const salesColumns: Column<Sale>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'type', header: 'Тип' },
    { key: 'tonnage', header: 'Тоннаж', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => `${formatNumber(r.tonnage, 2)} т` },
    { key: 'price_per_ton', header: 'Цена/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton, r.currency) },
    { key: 'total_sum', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.total_sum), render: (r) => formatMoney(r.total_sum, r.currency) },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => (r.source === 'ticket' ? <Badge tone="blue">Тикет {r.ticket_number}</Badge> : <Badge tone="slate">Склад</Badge>),
    },
    { key: 'margin_total', header: 'Маржа', align: 'right', sortValue: (r) => Number(r.margin_total), render: (r) => formatMoney(r.margin_total) },
  ];

  const paymentColumns: Column<CashIncome>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'category', header: 'Категория' },
    { key: 'amount', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.amount), render: (r) => formatMoney(r.amount, r.currency) },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <Link to="/clients" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-700">
        ← Клиенты
      </Link>
      <PageHeader title={client?.name ?? '...'} subtitle={client?.phone ?? undefined} />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Куплено всего" value={formatMoney(balance?.purchased ?? 0)} />
        <StatCard label="Оплачено всего" value={formatMoney(balance?.paid ?? 0)} />
        <StatCard
          label="Текущий долг"
          value={formatMoney(balance?.balance ?? 0)}
          tone={Number(balance?.balance ?? 0) > 0 ? 'negative' : 'positive'}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-800">Взял (история продаж)</h2>
      <div className="mb-6">
        <DataTable columns={salesColumns} rows={sales.data ?? []} loading={sales.isLoading} getRowId={(r) => r.id} emptyMessage="Продаж пока нет" />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-800">Оплатил (история платежей)</h2>
      <DataTable columns={paymentColumns} rows={payments.data ?? []} loading={payments.isLoading} getRowId={(r) => r.id} emptyMessage="Платежей пока нет" />
    </div>
  );
}
