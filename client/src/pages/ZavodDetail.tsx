import { Link, useParams } from 'react-router-dom';
import { cashExpenseHooks, incomingHooks, ticketsHooks, useZavodBalances, zavodyHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { CashExpense } from '@/types';

interface PurchaseRow {
  key: string;
  date: string;
  source: 'FACT' | 'DIRECT' | 'ticket';
  cementMarkName: string;
  tonnage: string;
  pricePerTon: string;
  totalSum: string;
}

export function ZavodDetail() {
  const { id } = useParams<{ id: string }>();
  const zavodId = Number(id);

  const zavody = zavodyHooks.useList();
  const balances = useZavodBalances();
  const incoming = incomingHooks.useList({ zavod_id: zavodId });
  const tickets = ticketsHooks.useList({ zavod_id: zavodId });
  const payments = cashExpenseHooks.useList({ zavod_id: zavodId });

  const zavod = zavody.data?.find((z) => z.id === zavodId);
  const balance = balances.data?.find((b) => b.id === zavodId);

  const purchases: PurchaseRow[] = [
    ...(incoming.data ?? []).map(
      (r): PurchaseRow => ({
        key: `in-${r.id}`,
        date: r.date,
        source: r.warehouse,
        cementMarkName: r.cement_mark_name,
        tonnage: r.tonnage,
        pricePerTon: r.price_per_ton,
        totalSum: r.total_sum,
      }),
    ),
    ...(tickets.data ?? []).map(
      (t): PurchaseRow => ({
        key: `t-${t.id}`,
        date: t.date,
        source: 'ticket',
        cementMarkName: t.cement_mark_name,
        tonnage: t.bought_tonnage,
        pricePerTon: t.price_per_ton,
        totalSum: t.bought_sum,
      }),
    ),
  ];

  const purchaseColumns: Column<PurchaseRow>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => {
        if (r.source === 'ticket') return <Badge tone="blue">Тикет</Badge>;
        if (r.source === 'DIRECT') return <Badge tone="amber">Напрямую</Badge>;
        return <Badge tone="slate">Факт</Badge>;
      },
    },
    { key: 'cementMarkName', header: 'Марка' },
    {
      key: 'tonnage',
      header: 'Объём',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 2)} т`,
    },
    {
      key: 'pricePerTon',
      header: 'Цена/т',
      align: 'right',
      sortValue: (r) => Number(r.pricePerTon),
      render: (r) => formatMoney(r.pricePerTon),
    },
    {
      key: 'totalSum',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.totalSum),
      render: (r) => formatMoney(r.totalSum),
    },
  ];

  const paymentColumns: Column<CashExpense>[] = [
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
      <PageHeader title={zavod?.name ?? '...'} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Куплено всего (прямые приходы)" value={formatMoney(balance?.purchased ?? 0)} />
        <StatCard label="Оплачено" value={formatMoney(balance?.paid ?? 0)} />
        <StatCard
          label="Мы должны"
          value={formatMoney(balance?.balance ?? 0)}
          tone={Number(balance?.balance ?? 0) > 0 ? 'negative' : 'positive'}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Купили (приходы и тикеты)</h2>
      <div className="mb-6">
        <DataTable
          columns={purchaseColumns}
          rows={purchases}
          loading={incoming.isLoading || tickets.isLoading}
          getRowId={(r) => r.key}
          emptyMessage="Покупок пока нет"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Оплатили</h2>
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
