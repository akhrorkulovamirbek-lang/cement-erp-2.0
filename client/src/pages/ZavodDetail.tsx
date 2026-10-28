import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cashExpenseHooks, incomingHooks, ticketsHooks, useZavodBalances, zavodyHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { downloadStyledTable, excelError } from '@/lib/styledExcel';
import { useToast } from '@/lib/toast';
import type { CashExpense } from '@/types';

type Source = 'FACT' | 'DIRECT' | 'CLIENT_GOODS' | 'ticket';

interface PurchaseRow {
  key: string;
  date: string;
  source: Source;
  cementMarkName: string;
  factoryName: string;
  packaging: string;
  tonnage: string;
  pricePerTon: string;
  totalSum: string;
  machine: string;
}

const SOURCE_LABEL: Record<Source, string> = {
  FACT: 'Факт',
  DIRECT: 'Напрямую',
  CLIENT_GOODS: 'От клиента (не в долг поставщику)',
  ticket: 'Тикет',
};

/** Карточка поставщика: покупки и оплаты по датам. Период, быстрые фильтры и поиск работают на обе таблицы,
 * итоги считаются по тому, что показано. Весь отчёт можно скачать в Excel (с остатком долга по ходу). */
export function ZavodDetail() {
  const { id } = useParams<{ id: string }>();
  const zavodId = Number(id);
  const { notify } = useToast();

  const zavody = zavodyHooks.useList();
  const balances = useZavodBalances();
  const incoming = incomingHooks.useList({ zavod_id: zavodId });
  const tickets = ticketsHooks.useList({ zavod_id: zavodId });
  const payments = cashExpenseHooks.useList({ zavod_id: zavodId });

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const zavod = zavody.data?.find((z) => z.id === zavodId);
  const balance = balances.data?.find((b) => b.id === zavodId);

  const allPurchases: PurchaseRow[] = [
    ...(incoming.data ?? []).map(
      (r): PurchaseRow => ({
        key: `in-${r.id}`,
        date: r.date,
        source: r.warehouse,
        cementMarkName: r.cement_mark_name,
        factoryName: r.factory_name ?? '',
        packaging: PACKAGING_LABELS[r.packaging],
        tonnage: r.tonnage,
        pricePerTon: r.price_per_ton,
        totalSum: r.total_sum,
        // У прямой продажи номер машины хранится в связанной продаже — берём ту же машину, что показывает Приход.
        machine: r.machine_display ?? r.machine_number ?? '',
      }),
    ),
    ...(tickets.data ?? []).map(
      (t): PurchaseRow => ({
        key: `t-${t.id}`,
        date: t.date,
        source: 'ticket',
        cementMarkName: t.cement_mark_name,
        factoryName: t.factory_name ?? '',
        packaging: PACKAGING_LABELS[t.packaging],
        tonnage: t.bought_tonnage,
        pricePerTon: t.price_per_ton,
        totalSum: t.bought_sum,
        machine: '',
      }),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const needle = q.trim().toLowerCase();
  const inPeriod = (date: string) => (!from || date >= from) && (!to || date <= to);

  const purchases = allPurchases.filter(
    (r) =>
      inPeriod(r.date) &&
      (!needle || [r.cementMarkName, r.factoryName, r.machine, r.packaging, SOURCE_LABEL[r.source]].some((v) => v.toLowerCase().includes(needle))),
  );
  const paymentRows = (payments.data ?? []).filter(
    (r) =>
      inPeriod(r.date) &&
      (!needle || [r.comment ?? '', r.payment_type, r.category, r.amount].some((v) => String(v).toLowerCase().includes(needle))),
  );

  const uzs = (r: CashExpense) => (r.currency === 'USD' ? Number(r.amount) * Number(r.usd_rate ?? 0) : Number(r.amount));
  // «В долг» — приходы Факт/Напрямую; тикеты оплачены с брокерского счёта сразу, цемент от клиента — не покупка у завода.
  const boughtOnCredit = purchases.filter((r) => r.source === 'FACT' || r.source === 'DIRECT').reduce((s, r) => s + Number(r.totalSum), 0);
  const paidTotal = paymentRows.filter((r) => r.category === 'цемент').reduce((s, r) => s + uzs(r), 0);
  const totalTonnage = purchases.reduce((s, r) => s + Number(r.tonnage), 0);
  const totalSum = purchases.reduce((s, r) => s + Number(r.totalSum), 0);

  const purchaseColumns: Column<PurchaseRow>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => {
        if (r.source === 'ticket') return <Badge tone="blue">Тикет</Badge>;
        if (r.source === 'DIRECT') return <Badge tone="amber">Напрямую</Badge>;
        if (r.source === 'CLIENT_GOODS') return <Badge tone="blue">От клиента (не в долг заводу)</Badge>;
        return <Badge tone="slate">Факт</Badge>;
      },
    },
    { key: 'factoryName', header: 'Завод', render: (r) => r.factoryName || '—' },
    { key: 'cementMarkName', header: 'Марка' },
    {
      key: 'machine',
      header: 'Машина',
      render: (r) =>
        r.machine ? (
          <Link to={`/vehicles/${encodeURIComponent(r.machine)}`} className="text-primary hover:underline">
            {r.machine}
          </Link>
        ) : (
          ''
        ),
    },
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
  const purchaseFooter: ReactNode[] = ['Итого', '', '', '', '', `${formatNumber(totalTonnage, 2)} т`, '', formatMoney(totalSum)];

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
  const paymentFooter: ReactNode[] = ['Итого (в сумах)', '', formatMoney(paymentRows.reduce((s, r) => s + uzs(r), 0)), '', ''];

  async function exportToExcel() {
    type Ev = { date: string; order: string; row: (string | number | null)[]; delta: number; fill?: string };
    const events: Ev[] = [];
    for (const r of allPurchases) {
      const credit = r.source === 'FACT' || r.source === 'DIRECT';
      events.push({
        date: r.date,
        order: r.key,
        delta: credit ? Number(r.totalSum) : 0,
        fill: r.source === 'ticket' || r.source === 'CLIENT_GOODS' ? 'FFE3F0FB' : 'FFFFF4E0',
        row: [
          r.date,
          credit ? `Покупка (${SOURCE_LABEL[r.source].toLowerCase()})` : r.source === 'ticket' ? 'Тикет (оплачен с брокерского счёта)' : 'Принят цемент от клиента (не в долг поставщику)',
          r.factoryName,
          r.cementMarkName,
          r.packaging,
          r.machine,
          Number(r.tonnage),
          Number(r.pricePerTon),
          credit ? Number(r.totalSum) : null,
          null,
          '',
          '',
        ],
      });
    }
    for (const r of payments.data ?? []) {
      const counts = r.category === 'цемент';
      events.push({
        date: r.date,
        order: `p-${r.id}`,
        delta: counts ? -uzs(r) : 0,
        fill: 'FFE6F4EA',
        row: [r.date, 'Оплата поставщику', '', '', '', '', null, null, null, counts ? uzs(r) : null, r.payment_type, r.comment ?? ''],
      });
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order));

    const opening = Number(zavod?.initial_debt ?? 0);
    let running = opening;
    const rows: (string | number | null)[][] = [];
    const fills: (string | undefined)[] = [];
    if (opening) {
      rows.push(['', 'Начальный долг', '', '', '', '', null, null, opening, null, '', '', opening]);
      fills.push('FFEDEDED');
    }
    for (const e of events) {
      running += e.delta;
      rows.push([...e.row, running]);
      fills.push(e.fill);
    }
    try {
      await downloadStyledTable({
        filename: `Поставщик_${zavod?.name ?? zavodId}.xlsx`,
        sheetName: 'Отчёт по поставщику',
        title: `Отчёт по поставщику: ${zavod?.name ?? ''}`,
        summary: [
          ['Куплено всего (в долг), сум', Number(balance?.purchased ?? 0), '#,##0'],
          ['Оплачено всего, сум', Number(balance?.paid ?? 0), '#,##0'],
          [Number(balance?.balance ?? 0) < 0 ? 'Поставщик должен нам, сум' : 'Мы должны поставщику, сум', Math.abs(Number(balance?.balance ?? 0)), '#,##0'],
        ],
        columns: [
          { header: 'Дата', width: 12, align: 'center' },
          { header: 'Событие', width: 34 },
          { header: 'Завод', width: 18 },
          { header: 'Марка', width: 16 },
          { header: 'Упаковка', width: 11 },
          { header: 'Машина', width: 16 },
          { header: 'Тоннаж, т', width: 11, fmt: '#,##0.000', align: 'right' },
          { header: 'Цена за тонну, сум', width: 17, fmt: '#,##0', align: 'right' },
          { header: 'Начислено (долг +), сум', width: 19, fmt: '#,##0', align: 'right' },
          { header: 'Оплачено (долг −), сум', width: 19, fmt: '#,##0', align: 'right' },
          { header: 'Способ оплаты', width: 16 },
          { header: 'Комментарий', width: 26 },
          { header: 'Остаток долга, сум', width: 19, fmt: '#,##0;[Red]-#,##0', align: 'right' },
        ],
        rows,
        rowFills: fills,
        totals: ['ИТОГО', '', '', '', '', '', null, null, Number(balance?.purchased ?? 0), Number(balance?.paid ?? 0), '', '', Number(balance?.balance ?? 0)],
      });
    } catch (e) {
      notify(excelError(e), 'error');
    }
  }

  return (
    <div>
      <Link to="/counterparties" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Контрагенты
      </Link>
      <PageHeader
        title={zavod?.name ?? '...'}
        action={
          <Button variant="outline" onClick={exportToExcel}>
            Скачать в Excel
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Куплено всего (прямые приходы)" value={formatMoney(balance?.purchased ?? 0)} />
        <StatCard label="Оплачено" value={formatMoney(balance?.paid ?? 0)} />
        <StatCard
          label={Number(balance?.balance ?? 0) < 0 ? 'Поставщик должен нам' : 'Мы должны'}
          value={formatMoney(Math.abs(Number(balance?.balance ?? 0)))}
          tone={Number(balance?.balance ?? 0) > 0 ? 'negative' : 'positive'}
        />
      </div>

      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} q={q} onQChange={setQ} qPlaceholder="Поиск: марка, машина, комментарий…" />

      <h2 className="mb-2 text-sm font-semibold">За выбранный период{from || to ? '' : ' (за всё время)'}</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Куплено в долг" value={formatMoney(boughtOnCredit)} />
        <StatCard label="Оплачено поставщику" value={formatMoney(paidTotal)} />
        <StatCard label="Разница" value={formatMoney(boughtOnCredit - paidTotal)} tone={boughtOnCredit - paidTotal > 0 ? 'negative' : 'positive'} />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Купили (приходы и тикеты)</h2>
      <div className="mb-6">
        <DataTable
          columns={purchaseColumns}
          rows={purchases}
          loading={incoming.isLoading || tickets.isLoading}
          getRowId={(r) => r.key}
          emptyMessage="Покупок за этот период нет"
          footer={purchaseFooter}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Оплатили</h2>
      <DataTable
        columns={paymentColumns}
        rows={paymentRows}
        loading={payments.isLoading}
        getRowId={(r) => r.id}
        emptyMessage="Платежей за этот период нет"
        footer={paymentFooter}
      />
    </div>
  );
}
