import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCashServiceSummary,
  useCementReport,
  useClientBalances,
  useVehiclesReport,
  useZavodBalances,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatMoney, formatNumber } from '@/lib/format';
import type { CementReportRow, ClientBalance, VehicleReportRow, ZavodBalance } from '@/types';

/** Раздел «Отчёты» — пять готовых разрезов, не конструктор (см. контекст плана): владелец
 * подтвердил, что нужны конкретные готовые срезы с фильтром периода, а не гибкая сборка полей. */
export function Reports() {
  return (
    <div>
      <PageHeader title="Отчёты" subtitle="Цемент, логистика, контрагенты и обналичивание — в одном месте" />
      <Tabs defaultValue="cement">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cement">Цемент</TabsTrigger>
          <TabsTrigger value="vehicles">Логистика</TabsTrigger>
          <TabsTrigger value="clients">Клиенты</TabsTrigger>
          <TabsTrigger value="zavody">Заводы</TabsTrigger>
          <TabsTrigger value="cash-service">Обналичивание</TabsTrigger>
        </TabsList>

        <TabsContent value="cement" className="mt-4">
          <CementTab />
        </TabsContent>
        <TabsContent value="vehicles" className="mt-4">
          <VehiclesTab />
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <ClientsTab />
        </TabsContent>
        <TabsContent value="zavody" className="mt-4">
          <ZavodyTab />
        </TabsContent>
        <TabsContent value="cash-service" className="mt-4">
          <CashServiceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CementTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useCementReport({ from: from || undefined, to: to || undefined });

  const columns: Column<CementReportRow>[] = [
    { key: 'zavod_name', header: 'Завод', sortValue: (r) => r.zavod_name },
    { key: 'cement_mark_name', header: 'Марка', sortValue: (r) => r.cement_mark_name },
    { key: 'packaging', header: 'Упаковка', render: (r) => PACKAGING_LABELS[r.packaging] },
    {
      key: 'purchased_tonnage',
      header: 'Куплено, т',
      align: 'right',
      sortValue: (r) => Number(r.purchased_tonnage),
      render: (r) => formatNumber(r.purchased_tonnage, 3),
    },
    {
      key: 'purchased_sum',
      header: 'Куплено, сум',
      align: 'right',
      sortValue: (r) => Number(r.purchased_sum),
      render: (r) => formatMoney(r.purchased_sum),
    },
    {
      key: 'goods_received_tonnage',
      header: 'В счёт долга, т',
      align: 'right',
      sortValue: (r) => Number(r.goods_received_tonnage),
      render: (r) => (Number(r.goods_received_tonnage) > 0 ? formatNumber(r.goods_received_tonnage, 3) : '—'),
    },
    {
      key: 'sold_tonnage',
      header: 'Продано, т',
      align: 'right',
      sortValue: (r) => Number(r.sold_tonnage),
      render: (r) => formatNumber(r.sold_tonnage, 3),
    },
    {
      key: 'sold_sum',
      header: 'Продано, сум',
      align: 'right',
      sortValue: (r) => Number(r.sold_sum),
      render: (r) => formatMoney(r.sold_sum),
    },
    {
      key: 'margin_total',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin_total),
      render: (r) => formatMoney(r.margin_total),
    },
  ];

  return (
    <div>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <DataTable
        columns={columns}
        rows={report.data ?? []}
        loading={report.isLoading}
        getRowId={(r) => `${r.zavod_name}-${r.cement_mark_name}-${r.packaging}`}
        emptyMessage="Нет данных за период"
      />
    </div>
  );
}

function VehiclesTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useVehiclesReport({ from: from || undefined, to: to || undefined });

  const columns: Column<VehicleReportRow>[] = [
    { key: 'label', header: 'Машина / Перевозчик', sortValue: (r) => r.label },
    {
      key: 'type',
      header: 'Тип',
      render: (r) => (r.type === 'own' ? <Badge tone="slate">Своя</Badge> : <Badge tone="amber">Наёмная</Badge>),
    },
    { key: 'trip_count', header: 'Рейсов', align: 'right', sortValue: (r) => r.trip_count },
    {
      key: 'revenue',
      header: 'Принесла',
      align: 'right',
      sortValue: (r) => Number(r.revenue),
      render: (r) => formatMoney(r.revenue),
    },
    {
      key: 'cost',
      header: 'Потрачено',
      align: 'right',
      sortValue: (r) => Number(r.cost),
      render: (r) => formatMoney(r.cost),
    },
    {
      key: 'margin',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin),
      render: (r) => (
        <span className={Number(r.margin) >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-destructive'}>
          {formatMoney(r.margin)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <DataTable
        columns={columns}
        rows={report.data ?? []}
        loading={report.isLoading}
        getRowId={(r) => `${r.type}-${r.label}`}
        emptyMessage="Нет рейсов за период"
      />
    </div>
  );
}

function ClientsTab() {
  const balances = useClientBalances();

  const columns: Column<ClientBalance>[] = [
    {
      key: 'name',
      header: 'Клиент',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/clients/${r.id}`} className="font-medium text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: 'purchased',
      header: 'Взял',
      align: 'right',
      sortValue: (r) => Number(r.purchased),
      render: (r) => formatMoney(r.purchased),
    },
    {
      key: 'paid',
      header: 'Оплатил',
      align: 'right',
      sortValue: (r) => Number(r.paid),
      render: (r) => formatMoney(r.paid),
    },
    {
      key: 'balance',
      header: 'Долг',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Без долга</Badge>;
        return <span className="font-semibold text-destructive">{formatMoney(n)}</span>;
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={balances.data ?? []}
      loading={balances.isLoading}
      getRowId={(r) => r.id}
      emptyMessage="Нет клиентов"
    />
  );
}

function ZavodyTab() {
  const balances = useZavodBalances();

  const columns: Column<ZavodBalance>[] = [
    {
      key: 'name',
      header: 'Завод',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/zavody/${r.id}`} className="font-medium text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: 'purchased',
      header: 'Куплено',
      align: 'right',
      sortValue: (r) => Number(r.purchased),
      render: (r) => formatMoney(r.purchased),
    },
    {
      key: 'paid',
      header: 'Оплачено',
      align: 'right',
      sortValue: (r) => Number(r.paid),
      render: (r) => formatMoney(r.paid),
    },
    {
      key: 'balance',
      header: 'Мы должны',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Долга нет</Badge>;
        return <span className="font-semibold text-destructive">{formatMoney(n)}</span>;
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={balances.data ?? []}
      loading={balances.isLoading}
      getRowId={(r) => r.id}
      emptyMessage="Нет заводов"
    />
  );
}

function CashServiceTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const summary = useCashServiceSummary({ from: from || undefined, to: to || undefined });

  return (
    <div>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Комиссия за период" value={formatMoney(summary.data?.commissionTotal ?? 0)} tone="positive" />
        <StatCard label="Переводов за период" value={String(summary.data?.count ?? 0)} />
        <StatCard label="Сумма переводов" value={formatMoney(summary.data?.transferTotal ?? 0)} />
      </div>
    </div>
  );
}
