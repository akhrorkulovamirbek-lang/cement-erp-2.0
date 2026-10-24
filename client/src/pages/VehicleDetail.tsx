import { Link, useParams } from 'react-router-dom';
import { type VehicleHistory, useVehicleHistory } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

type Trip = VehicleHistory['trips'][number];
type Expense = VehicleHistory['expenses'][number];

/** История одной машины по госномеру — то же, что карточка клиента, но для рейсов: куда ездила,
 * сколько принесла, сколько на неё потрачено. Работает и для своих, и для наёмных машин. */
export function VehicleDetail() {
  const { number = '' } = useParams<{ number: string }>();
  const history = useVehicleHistory(decodeURIComponent(number));
  const data = history.data;

  const tripColumns: Column<Trip>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'sale_type',
      header: 'Тип',
      render: (r) => (r.sale_type === 'CEMENT' ? <Badge tone="slate">Цемент</Badge> : <Badge tone="blue">Логистика</Badge>),
    },
    { key: 'client_name', header: 'Клиент', render: (r) => r.client_name ?? '—' },
    { key: 'route', header: 'Маршрут', render: (r) => r.route || r.zavod_name || '—' },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 2)} т`,
    },
    {
      key: 'freight',
      header: 'Перевозка',
      align: 'right',
      render: (r) =>
        r.vehicle_type !== 'CLIENT' && r.freight_price_per_ton ? formatMoney(Number(r.freight_price_per_ton) * Number(r.tonnage)) : '',
    },
    {
      key: 'hire',
      header: 'Найм перевозчика',
      align: 'right',
      render: (r) =>
        r.vehicle_type === 'HIRED' && r.hire_price_per_ton
          ? `${r.carrier_name ? r.carrier_name + ': ' : ''}${formatMoney(Number(r.hire_price_per_ton) * Number(r.tonnage))}`
          : '',
    },
    {
      key: 'awaiting_shipment',
      header: 'Статус',
      render: (r) => (r.awaiting_shipment ? <Badge tone="amber">Ждёт отгрузки</Badge> : ''),
    },
  ];

  const expenseColumns: Column<Expense>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'expense_type', header: 'Тип расхода', render: (r) => r.expense_type || r.category },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount_uzs),
      render: (r) => <MoneyCell amount={r.amount} currency={r.currency} usdRate={r.usd_rate} />,
    },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '' },
  ];

  const s = data?.summary;
  const subtitle = [
    data?.machine ? 'Своя машина' : data && data.trips.length > 0 ? 'Наёмная машина' : null,
    data?.machine?.driver ? `водитель: ${data.machine.driver}` : null,
    data && data.carriers.length > 0 ? `перевозчик: ${data.carriers.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <Link to="/sales" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Продажи
      </Link>
      <PageHeader title={data?.number ?? decodeURIComponent(number)} subtitle={subtitle || undefined} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Рейсов" value={String(s?.tripCount ?? 0)} hint={`${formatNumber(s?.tonnage ?? 0, 2)} т всего`} />
        <StatCard label="Принесла (перевозка)" value={formatMoney(s?.revenue ?? 0)} />
        <StatCard label="Расходы" value={formatMoney((s?.hireCost ?? 0) + (s?.expensesTotal ?? 0))} hint="найм перевозчика + расходы кассы" />
        <StatCard label="Прибыль" value={formatMoney(s?.margin ?? 0)} tone={(s?.margin ?? 0) >= 0 ? 'positive' : 'negative'} />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Рейсы</h2>
      <div className="mb-6">
        <DataTable
          columns={tripColumns}
          rows={data?.trips ?? []}
          loading={history.isLoading}
          getRowId={(r) => r.id}
          emptyMessage="Рейсов по этой машине пока нет"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Расходы на машину (касса)</h2>
      <DataTable
        columns={expenseColumns}
        rows={data?.expenses ?? []}
        loading={history.isLoading}
        getRowId={(r) => r.id}
        emptyMessage="Расходов на эту машину пока нет"
      />
    </div>
  );
}
