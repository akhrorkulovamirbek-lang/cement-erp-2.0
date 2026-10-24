import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCashServiceSummary,
  useCarriersReport,
  useCementReport,
  useClientBalances,
  useSuppliersReport,
  useVehiclesReport,
  useZavodBalances,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatMoney, formatNumber } from '@/lib/format';
import { downloadStyledTable } from '@/lib/styledExcel';
import { useToast } from '@/lib/toast';
import type { CarrierBalance, CementReportRow, ClientBalance, SupplierReportRow, VehicleReportRow, ZavodBalance } from '@/types';

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
          <TabsTrigger value="suppliers">Поставщики</TabsTrigger>
          <TabsTrigger value="carriers">Перевозчики</TabsTrigger>
          <TabsTrigger value="cash-service">Обналичивание</TabsTrigger>
        </TabsList>

        <TabsContent value="cement" className="mt-4">
          <CementTab />
        </TabsContent>
        <TabsContent value="vehicles" className="mt-4">
          <VehiclesTab />
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">Долги и баланс на сегодня — от выбора периода не зависят (периоды есть на вкладках «Цемент», «Логистика», «Обналичивание»).</p>
          <ClientsTab />
        </TabsContent>
        <TabsContent value="zavody" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">Долги и баланс на сегодня — от выбора периода не зависят (периоды есть на вкладках «Цемент», «Логистика», «Обналичивание»).</p>
          <ZavodyTab />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">Долги и баланс на сегодня — от выбора периода не зависят.</p>
          <SuppliersTab />
        </TabsContent>
        <TabsContent value="carriers" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">Долги и баланс на сегодня — от выбора периода не зависят (периоды есть на вкладках «Цемент», «Логистика», «Обналичивание»).</p>
          <CarriersTab />
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

  const rows = report.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      purchased_tonnage: acc.purchased_tonnage + Number(r.purchased_tonnage),
      purchased_sum: acc.purchased_sum + Number(r.purchased_sum),
      goods_received_tonnage: acc.goods_received_tonnage + Number(r.goods_received_tonnage),
      sold_tonnage: acc.sold_tonnage + Number(r.sold_tonnage),
      sold_sum: acc.sold_sum + Number(r.sold_sum),
      margin_total: acc.margin_total + Number(r.margin_total),
    }),
    { purchased_tonnage: 0, purchased_sum: 0, goods_received_tonnage: 0, sold_tonnage: 0, sold_sum: 0, margin_total: 0 },
  );

  return (
    <div>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        getRowId={(r) => `${r.zavod_name}-${r.cement_mark_name}-${r.packaging}`}
        emptyMessage="Нет данных за период"
        footer={[
          'Итого',
          '',
          '',
          formatNumber(totals.purchased_tonnage, 3),
          formatMoney(totals.purchased_sum),
          totals.goods_received_tonnage > 0 ? formatNumber(totals.goods_received_tonnage, 3) : '—',
          formatNumber(totals.sold_tonnage, 3),
          formatMoney(totals.sold_sum),
          formatMoney(totals.margin_total),
        ]}
      />
    </div>
  );
}

function VehiclesTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useVehiclesReport({ from: from || undefined, to: to || undefined });

  const columns: Column<VehicleReportRow>[] = [
    {
      key: 'label',
      header: 'Машина / Перевозчик',
      sortValue: (r) => r.label,
      render: (r) =>
        r.type === 'own' ? (
          <Link to={`/vehicles/${encodeURIComponent(r.label)}`} className="font-medium text-primary hover:underline">
            {r.label}
          </Link>
        ) : (
          r.label
        ),
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

  const rows = report.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      trip_count: acc.trip_count + r.trip_count,
      revenue: acc.revenue + Number(r.revenue),
      cost: acc.cost + Number(r.cost),
      margin: acc.margin + Number(r.margin),
    }),
    { trip_count: 0, revenue: 0, cost: 0, margin: 0 },
  );

  return (
    <div>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        getRowId={(r) => `${r.type}-${r.label}`}
        emptyMessage="Нет рейсов за период"
        footer={[
          'Итого',
          '',
          String(totals.trip_count),
          formatMoney(totals.revenue),
          formatMoney(totals.cost),
          <span key="margin" className={totals.margin >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-destructive'}>
            {formatMoney(totals.margin)}
          </span>,
        ]}
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
        if (n === 0) return <Badge tone="green">Без долга</Badge>;
        if (n < 0) return <Badge tone="amber">Переплата {formatMoney(-n)}</Badge>;
        return <span className="font-semibold text-destructive">{formatMoney(n)}</span>;
      },
    },
  ];

  const rows = balances.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      purchased: acc.purchased + Number(r.purchased),
      paid: acc.paid + Number(r.paid),
      balance: acc.balance + Number(r.balance),
    }),
    { purchased: 0, paid: 0, balance: 0 },
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={balances.isLoading}
      getRowId={(r) => r.id}
      emptyMessage="Нет клиентов"
      footer={[
        'Итого',
        formatMoney(totals.purchased),
        formatMoney(totals.paid),
        <span key="balance" className={totals.balance > 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
          {formatMoney(totals.balance)}
        </span>,
      ]}
    />
  );
}

/** Поставщики: заводы и клиенты с пометкой «Поставщик» — что получили, что продали им, что заплатили
 * в обе стороны и итог. Скачивается в Excel так же, как отчёт по клиенту. */
function SuppliersTab() {
  const { notify } = useToast();
  const report = useSuppliersReport();
  const rows = report.data ?? [];

  const columns: Column<SupplierReportRow>[] = [
    {
      key: 'name',
      header: 'Поставщик',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Link to={r.type === 'zavod' ? `/zavody/${r.id}` : `/clients/${r.id}`} className="font-medium text-primary hover:underline">
            {r.name}
          </Link>
          <Badge tone={r.type === 'zavod' ? 'slate' : 'blue'}>{r.type === 'zavod' ? 'Завод' : 'Клиент-поставщик'}</Badge>
        </span>
      ),
    },
    { key: 'received_tonnage', header: 'Получено, т', align: 'right', sortValue: (r) => Number(r.received_tonnage), render: (r) => `${formatNumber(r.received_tonnage, 2)} т` },
    { key: 'received_sum', header: 'Получено на сумму', align: 'right', sortValue: (r) => Number(r.received_sum), render: (r) => formatMoney(r.received_sum) },
    { key: 'sold_sum', header: 'Продали ему', align: 'right', sortValue: (r) => Number(r.sold_sum), render: (r) => (Number(r.sold_sum) ? formatMoney(r.sold_sum) : '—') },
    { key: 'paid_by_us', header: 'Заплатили ему', align: 'right', sortValue: (r) => Number(r.paid_by_us), render: (r) => formatMoney(r.paid_by_us) },
    { key: 'paid_by_him', header: 'Он заплатил нам', align: 'right', sortValue: (r) => Number(r.paid_by_him), render: (r) => (Number(r.paid_by_him) ? formatMoney(r.paid_by_him) : '—') },
    {
      key: 'we_owe',
      header: 'Итог',
      align: 'right',
      sortValue: (r) => Number(r.we_owe),
      render: (r) => {
        const n = Number(r.we_owe);
        if (n === 0) return <Badge tone="green">Рассчитались</Badge>;
        if (n < 0) return <span className="font-semibold text-emerald-600">Должен нам {formatMoney(-n)}</span>;
        return <span className="font-semibold text-destructive">Мы должны {formatMoney(n)}</span>;
      },
    },
  ];

  const sum = (f: (r: SupplierReportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totals = {
    tonnage: sum((r) => Number(r.received_tonnage)),
    received: sum((r) => Number(r.received_sum)),
    sold: sum((r) => Number(r.sold_sum)),
    paidUs: sum((r) => Number(r.paid_by_us)),
    paidHim: sum((r) => Number(r.paid_by_him)),
    owe: sum((r) => Number(r.we_owe)),
  };

  async function exportToExcel() {
    try {
      await downloadStyledTable({
        filename: 'Отчёт_по_поставщикам.xlsx',
        sheetName: 'Поставщики',
        title: 'Отчёт по поставщикам',
        subtitle: 'заводы и клиенты-поставщики',
        summary: [
          [totals.owe < 0 ? 'Поставщики должны нам, сум' : 'Мы должны поставщикам, сум', Math.abs(totals.owe), '#,##0'],
          ['Получено цемента, т', totals.tonnage, '#,##0.000'],
        ],
        columns: [
          { header: 'Поставщик', width: 30 },
          { header: 'Тип', width: 18 },
          { header: 'Получено, т', width: 14, fmt: '#,##0.000', align: 'right' },
          { header: 'Получено на сумму, сум', width: 22, fmt: '#,##0', align: 'right' },
          { header: 'Продали ему, сум', width: 19, fmt: '#,##0', align: 'right' },
          { header: 'Заплатили ему, сум', width: 19, fmt: '#,##0', align: 'right' },
          { header: 'Он заплатил нам, сум', width: 20, fmt: '#,##0', align: 'right' },
          { header: 'Итог (+ мы должны, − он должен), сум', width: 26, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        ],
        rows: rows.map((r) => [
          r.name,
          r.type === 'zavod' ? 'Завод' : 'Клиент-поставщик',
          Number(r.received_tonnage),
          Number(r.received_sum),
          Number(r.sold_sum),
          Number(r.paid_by_us),
          Number(r.paid_by_him),
          Number(r.we_owe),
        ]),
        rowFills: rows.map((r) => (r.type === 'zavod' ? 'FFFFF4E0' : 'FFE3F0FB')),
        totals: ['ИТОГО', '', totals.tonnage, totals.received, totals.sold, totals.paidUs, totals.paidHim, totals.owe],
      });
    } catch {
      notify('Не удалось сформировать файл', 'error');
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" onClick={exportToExcel} disabled={rows.length === 0}>
          Скачать в Excel
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        getRowId={(r) => `${r.type}-${r.id}`}
        emptyMessage="Поставщиков пока нет"
        searchable
        footer={[
          'Итого',
          `${formatNumber(totals.tonnage, 2)} т`,
          formatMoney(totals.received),
          formatMoney(totals.sold),
          formatMoney(totals.paidUs),
          formatMoney(totals.paidHim),
          totals.owe < 0 ? `Должны нам ${formatMoney(-totals.owe)}` : `Мы должны ${formatMoney(totals.owe)}`,
        ]}
      />
    </div>
  );
}

/** Перевозчики: начислено за наёмные рейсы, выплачено, баланс. Минус в балансе — переплата:
 * перевозчик получил больше, чем начислено, и теперь должен нам. */
function CarriersTab() {
  const report = useCarriersReport();
  const rows = report.data ?? [];

  const columns: Column<CarrierBalance>[] = [
    {
      key: 'name',
      header: 'Перевозчик',
      sortValue: (r) => r.name,
      render: (r) =>
        r.logist_id ? (
          <Link to={`/logists/${r.logist_id}`} className="font-medium text-primary hover:underline">
            {r.name}
          </Link>
        ) : (
          r.name
        ),
    },
    { key: 'owed', header: 'Начислено за рейсы', align: 'right', sortValue: (r) => Number(r.owed), render: (r) => formatMoney(r.owed) },
    { key: 'paid', header: 'Выплачено', align: 'right', sortValue: (r) => Number(r.paid), render: (r) => formatMoney(r.paid) },
    {
      key: 'balance',
      header: 'Баланс',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n === 0) return <Badge tone="green">Рассчитались</Badge>;
        if (n < 0) return <span className="font-semibold text-emerald-600">Должен нам {formatMoney(-n)}</span>;
        return <span className="font-semibold text-destructive">Мы должны {formatMoney(n)}</span>;
      },
    },
  ];

  const totals = rows.reduce(
    (acc, r) => ({ owed: acc.owed + Number(r.owed), paid: acc.paid + Number(r.paid), balance: acc.balance + Number(r.balance) }),
    { owed: 0, paid: 0, balance: 0 },
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={report.isLoading}
      getRowId={(r) => r.name}
      emptyMessage="Перевозчиков пока нет"
      footer={[
        'Итого',
        formatMoney(totals.owed),
        formatMoney(totals.paid),
        totals.balance < 0 ? `Должны нам ${formatMoney(-totals.balance)}` : `Мы должны ${formatMoney(totals.balance)}`,
      ]}
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
        if (n === 0) return <Badge tone="green">Долга нет</Badge>;
        if (n < 0) return <span className="font-semibold text-emerald-600">Должен нам {formatMoney(-n)}</span>;
        return <span className="font-semibold text-destructive">{formatMoney(n)}</span>;
      },
    },
  ];

  const rows = balances.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      purchased: acc.purchased + Number(r.purchased),
      paid: acc.paid + Number(r.paid),
      balance: acc.balance + Number(r.balance),
    }),
    { purchased: 0, paid: 0, balance: 0 },
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={balances.isLoading}
      getRowId={(r) => r.id}
      emptyMessage="Нет заводов"
      footer={[
        'Итого',
        formatMoney(totals.purchased),
        formatMoney(totals.paid),
        <span key="balance" className={totals.balance > 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
          {formatMoney(totals.balance)}
        </span>,
      ]}
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
