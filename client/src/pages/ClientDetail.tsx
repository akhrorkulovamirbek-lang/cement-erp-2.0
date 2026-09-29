import { Link, useParams } from 'react-router-dom';
import { cashIncomeHooks, clientsHooks, salesHooks, useClientBalances } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { CashIncome, Sale } from '@/types';

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
    {
      key: 'sale_type',
      header: 'Тип',
      render: (r) => (r.sale_type === 'CEMENT' ? <Badge tone="slate">Цемент</Badge> : <Badge tone="blue">Логистика</Badge>),
    },
    { key: 'cement_mark_name', header: 'Марка', render: (r) => r.cement_mark_name ?? '—' },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 2)} т`,
    },
    {
      key: 'total_sum',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.total_sum),
      render: (r) => formatMoney(r.total_sum),
    },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => {
        if (r.sale_type === 'LOGISTICS') return '—';
        if (r.source === 'ticket') return <Badge tone="blue">Тикет {r.ticket_number}</Badge>;
        if (r.source === 'direct') return <Badge tone="amber">Напрямую</Badge>;
        return <Badge tone="slate">Склад</Badge>;
      },
    },
    {
      key: 'margin_total',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin_total),
      render: (r) => (r.sale_type === 'CEMENT' ? formatMoney(r.margin_total) : '—'),
    },
  ];

  const paymentColumns: Column<CashIncome>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'category', header: 'Категория' },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => formatMoney(r.amount, r.currency),
    },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <Link to="/counterparties" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Контрагенты
      </Link>
      <PageHeader title={client?.name ?? '...'} subtitle={client?.phone ?? undefined} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Куплено всего" value={formatMoney(balance?.purchased ?? 0)} />
        <StatCard label="Оплачено всего" value={formatMoney(balance?.paid ?? 0)} />
        <StatCard
          label="Текущий долг"
          value={formatMoney(balance?.balance ?? 0)}
          tone={Number(balance?.balance ?? 0) > 0 ? 'negative' : 'positive'}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Взял (история продаж)</h2>
      <div className="mb-6">
        <DataTable
          columns={salesColumns}
          rows={sales.data ?? []}
          loading={sales.isLoading}
          getRowId={(r) => r.id}
          emptyMessage="Продаж пока нет"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Оплатил (история платежей)</h2>
      <DataTable
        columns={paymentColumns}
        rows={payments.data ?? []}
        loading={payments.isLoading}
        getRowId={(r) => r.id}
        emptyMessage="Платежей пока нет"
      />
    </div>
  );
}
