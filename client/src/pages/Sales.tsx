import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import {
  cementMarksHooks,
  clientsHooks,
  factoriesHooks,
  logistsHooks,
  machinesHooks,
  salesHooks,
  ticketsHooks,
  useSetDelivery,
  useShipSale,
  useSuggestions,
  useWarehouseBalance,
  zavodyHooks,
} from '@/api/modules';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { QuickAddClient } from '@/components/QuickAddClient';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, PlainSelect, RHFCheckbox, RHFSelect } from '@/components/form';
import { SuggestInput } from '@/components/SuggestInput';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PACKAGING_LABELS, SALE_TYPE_OPTIONS, VEHICLE_TYPE_OPTIONS, VEHICLE_TYPE_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber, todayISO } from '@/lib/format';
import { normalizePlateNumber } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import type { Client, Sale } from '@/types';

interface FormValues {
  is_deferred: boolean;
  awaiting_shipment: boolean;
  sale_type: 'CEMENT' | 'LOGISTICS';
  date: string;
  client_id: string;
  source: 'warehouse' | 'ticket' | '';
  ticket_id: string;
  factory_id: string;
  zavod_id: string;
  cement_mark_id: string;
  packaging: 'MESHOK' | 'NAVAL';
  price_per_ton: string;
  tonnage: string;
  vehicle_type: 'CLIENT' | 'OWN' | 'HIRED' | '';
  own_vehicle_id: string;
  machine_number: string;
  carrier_name: string;
  freight_price_per_ton: string;
  hire_price_per_ton: string;
  route: string;
  comment: string;
}

const emptyForm = (): FormValues => ({
  is_deferred: false,
  awaiting_shipment: false,
  sale_type: 'CEMENT',
  date: todayISO(),
  client_id: '',
  source: 'warehouse',
  ticket_id: '',
  factory_id: '',
  zavod_id: '',
  cement_mark_id: '',
  packaging: 'MESHOK',
  price_per_ton: '',
  tonnage: '',
  vehicle_type: 'CLIENT',
  own_vehicle_id: '',
  machine_number: '',
  carrier_name: '',
  freight_price_per_ton: '',
  hire_price_per_ton: '',
  route: '',
  comment: '',
});

/** Статус заказа: ждёт отгрузки → отгружен → клиент подтвердил «доставлен» или написал, что не доставлен. */
function statusLabel(r: Sale): string {
  if (r.awaiting_shipment) return 'Ждёт отгрузки';
  if (r.delivery_status === 'yes') return 'Доставлен';
  if (r.delivery_status === 'no') return 'Не доставлен';
  if (r.delivery_status === 'asked') return 'Ждём подтверждения клиента';
  return r.is_historical || !r.client_id ? '' : 'Отгружен';
}

export function Sales() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [factoryFilter, setFactoryFilter] = useState('');
  const [zavodFilter, setZavodFilter] = useState('');
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [q, setQ] = useState('');
  const list = salesHooks.useList({
    from: from || undefined,
    to: to || undefined,
    client_id: clientFilter || undefined,
    sale_type: typeFilter || undefined,
    factory_id: factoryFilter || undefined,
    zavod_id: zavodFilter || undefined,
    deferred: statusFilter === 'deferred' ? '1' : undefined,
    awaiting: statusFilter === 'awaiting' ? '1' : undefined,
    delivery: statusFilter === 'undelivered' ? 'no' : statusFilter === 'unconfirmed' ? 'asked' : statusFilter === 'delivered' ? 'yes' : undefined,
    q: q || undefined,
  });
  const ship = useShipSale();
  const setDelivery = useSetDelivery();
  const create = salesHooks.useCreate();
  const update = salesHooks.useUpdate();
  const del = salesHooks.useDelete();
  const clients = clientsHooks.useList();
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();
  const tickets = ticketsHooks.useList({ status: 'active' });
  const balance = useWarehouseBalance();
  const suggestions = useSuggestions();
  const logists = logistsHooks.useList();
  // См. комментарий у аналогичного стейта в Incoming.tsx — без этого Radix Select сбрасывает
  // только что выбранного нового клиента обратно в пустое значение.
  const [justAddedClient, setJustAddedClient] = useState<Client | null>(null);
  const clientOptions = (
    justAddedClient && !(clients.data ?? []).some((c) => c.id === justAddedClient.id)
      ? [justAddedClient, ...(clients.data ?? [])]
      : (clients.data ?? [])
  ).map((c) => ({ value: String(c.id), label: c.name }));

  const [editing, setEditing] = useState<Sale | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Sale | null>(null);
  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  function selectClient(client: Client) {
    setJustAddedClient(client);
    setValue('client_id', String(client.id), { shouldValidate: true });
    // См. комментарий в Incoming.tsx: Radix Select иногда один раз сам откатывает программно
    // установленное значение вскоре после первого рендера — подтверждаем ещё раз чуть позже.
    setTimeout(() => setValue('client_id', String(client.id), { shouldValidate: true }), 250);
  }

  const isDeferred = watch('is_deferred');
  const saleType = watch('sale_type');
  const source = watch('source');
  const vehicleType = watch('vehicle_type');
  const ticketId = watch('ticket_id');
  const zavodId = watch('zavod_id');
  const cementMarkId = watch('cement_mark_id');
  const packaging = watch('packaging');
  const machineNumber = watch('machine_number');
  const tonnage = Number(watch('tonnage')) || 0;
  const pricePerTon = Number(watch('price_per_ton')) || 0;
  const freightPerTon = Number(watch('freight_price_per_ton')) || 0;

  const selectedTicket = (tickets.data ?? []).find((t) => String(t.id) === ticketId);
  const factories = factoriesHooks.useList();
  const factoryOptions = (factories.data ?? []).filter((f) => f.active).map((f) => ({ value: String(f.id), label: f.name }));

  // Продажа с тикета: завод подставляется из тикета (можно поменять).
  useEffect(() => {
    if (selectedTicket?.factory_id) setValue('factory_id', String(selectedTicket.factory_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket?.id]);
  const currentBalance = (balance.data ?? []).find(
    (b) => String(b.zavod_id) === zavodId && String(b.cement_mark_id) === cementMarkId && b.packaging === packaging,
  );

  // Логистика: своя/наёмная определяется по совпадению номера со справочником (раздел 3 ТЗ, п.3) —
  // подсказка на фронте, сервер решает окончательно сам.
  const ownMachineNumbers = new Set((machines.data ?? []).map((m) => m.number));
  const logisticsVehicleGuess = machineNumber && ownMachineNumbers.has(normalizePlateNumber(machineNumber)) ? 'OWN' : 'HIRED';

  // Номер машины логиста из справочника → перевозчик подставляется сам.
  useEffect(() => {
    if (!machineNumber || vehicleType !== 'HIRED') return;
    const plate = normalizePlateNumber(machineNumber);
    const owner = (logists.data ?? []).find((l) => l.machines.includes(plate));
    if (owner) setValue('carrier_name', owner.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineNumber, vehicleType, logists.data]);

  useEffect(() => {
    if (saleType === 'LOGISTICS') setValue('vehicle_type', logisticsVehicleGuess);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleType, logisticsVehicleGuess]);

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Sale) {
    if (row.source === 'direct') {
      notify('Эта продажа связана с приходом «Напрямую» — измените её через Приход', 'error');
      return;
    }
    reset({
      is_deferred: row.is_deferred,
      awaiting_shipment: row.awaiting_shipment,
      sale_type: row.sale_type,
      date: row.date,
      client_id: row.client_id ? String(row.client_id) : '',
      source: row.source === 'ticket' ? 'ticket' : 'warehouse',
      ticket_id: row.ticket_id ? String(row.ticket_id) : '',
      factory_id: row.factory_id ? String(row.factory_id) : '',
      zavod_id: row.zavod_id ? String(row.zavod_id) : '',
      cement_mark_id: row.cement_mark_id ? String(row.cement_mark_id) : '',
      packaging: row.packaging ?? 'MESHOK',
      price_per_ton: row.price_per_ton ?? '',
      tonnage: row.tonnage,
      vehicle_type: row.vehicle_type,
      own_vehicle_id: row.own_vehicle_id ? String(row.own_vehicle_id) : '',
      machine_number: row.machine_number ?? '',
      carrier_name: row.carrier_name ?? '',
      freight_price_per_ton: row.freight_price_per_ton ?? '',
      hire_price_per_ton: row.hire_price_per_ton ?? '',
      route: row.route ?? '',
      comment: row.comment ?? '',
    });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    if (data.sale_type === 'CEMENT' && !data.factory_id) {
      notify('Выберите завод', 'error');
      return;
    }
    const payload = {
      sale_type: data.sale_type,
      date: data.date,
      is_deferred: data.is_deferred,
      awaiting_shipment: data.awaiting_shipment,
      client_id: data.client_id ? Number(data.client_id) : null,
      source: data.sale_type === 'CEMENT' ? data.source : null,
      ticket_id: data.sale_type === 'CEMENT' && data.source === 'ticket' ? Number(data.ticket_id) : null,
      factory_id: data.sale_type === 'CEMENT' && data.factory_id ? Number(data.factory_id) : null,
      zavod_id: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? Number(data.zavod_id) : null,
      cement_mark_id: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? Number(data.cement_mark_id) : null,
      packaging: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? data.packaging : null,
      price_per_ton: data.sale_type === 'CEMENT' && data.price_per_ton ? Number(data.price_per_ton) : null,
      tonnage: Number(data.tonnage),
      // Для LOGISTICS сервер определяет своя/наёмная сам по номеру — это значение только чтобы
      // пройти валидацию формы (обязательное поле), сервер его игнорирует для этого типа.
      vehicle_type: data.vehicle_type,
      // own_vehicle_id — только для Цемента: для Логистики сервер сам находит машину по номеру.
      own_vehicle_id: data.sale_type === 'CEMENT' && data.vehicle_type === 'OWN' ? Number(data.own_vehicle_id) : null,
      machine_number: data.vehicle_type === 'OWN' && data.sale_type === 'CEMENT' ? null : data.machine_number || null,
      carrier_name: data.vehicle_type === 'HIRED' ? data.carrier_name || null : null,
      freight_price_per_ton:
        (data.sale_type === 'LOGISTICS' || data.vehicle_type !== 'CLIENT') && data.freight_price_per_ton ? Number(data.freight_price_per_ton) : null,
      hire_price_per_ton: data.vehicle_type === 'HIRED' && data.hire_price_per_ton ? Number(data.hire_price_per_ton) : null,
      route: data.sale_type === 'LOGISTICS' ? data.route || null : null,
      comment: data.comment || null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify(data.is_deferred ? 'Продажа отложена — клиента и цену можно внести позже' : 'Продажа добавлена');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload });
        notify('Сохранено');
      }
      setEditing(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onDelivery(row: Sale, status: 'yes' | 'no' | null) {
    try {
      await setDelivery.mutateAsync({ id: row.id, status });
      notify(status === 'yes' ? 'Отмечено: доставлен' : status === 'no' ? 'Отмечено: не доставлен' : 'Отметка о доставке снята');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onShip(row: Sale) {
    try {
      await ship.mutateAsync(row.id);
      notify('Заказ отгружен');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      notify('Удалено');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setDeleting(null);
    }
  }

  const cementTotal = pricePerTon * tonnage;
  const freightTotal = vehicleType === 'CLIENT' ? 0 : freightPerTon * tonnage;
  const previewTotal = saleType === 'CEMENT' ? cementTotal + freightTotal : freightTotal;

  const columns: Column<Sale>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'sale_type',
      header: 'Тип',
      render: (r) => (r.sale_type === 'CEMENT' ? <Badge tone="slate">Цемент</Badge> : <Badge tone="blue">Логистика</Badge>),
    },
    {
      key: 'awaiting_shipment',
      header: 'Статус',
      sortValue: (r) => statusLabel(r),
      render: (r) => {
        const label = statusLabel(r);
        if (!label) return '';
        const tone = r.awaiting_shipment ? 'amber' : r.delivery_status === 'yes' ? 'green' : r.delivery_status === 'no' ? 'red' : r.delivery_status === 'asked' ? 'blue' : 'slate';
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    {
      key: 'client_name',
      header: 'Клиент',
      render: (r) => (r.client_name ? r.client_name : <Badge tone="amber">Отложена — клиент не указан</Badge>),
    },
    { key: 'factory_name', header: 'Завод', render: (r) => r.factory_name ?? '—' },
    { key: 'cement_mark_name', header: 'Марка', render: (r) => r.cement_mark_name ?? '—' },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 3)} т`,
    },
    {
      key: 'total_sum',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.total_sum),
      render: (r) => (r.is_deferred && Number(r.total_sum) === 0 ? '—' : formatMoney(r.total_sum)),
    },
    {
      key: 'margin_total',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin_total),
      render: (r) => (r.sale_type === 'CEMENT' ? formatMoney(r.margin_total) : '—'),
    },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => {
        if (r.sale_type === 'LOGISTICS') return '—';
        if (r.source === 'ticket') return <Badge tone="blue">{r.ticket_number}</Badge>;
        if (r.source === 'direct') return <Badge tone="amber">Напрямую</Badge>;
        return <Badge tone="slate">Склад</Badge>;
      },
    },
    {
      key: 'vehicle_type',
      header: 'Машина',
      render: (r) => {
        const plate = r.machine_number ?? r.own_vehicle_number;
        return (
          <>
            {VEHICLE_TYPE_LABELS[r.vehicle_type]}
            {plate && (
              <>
                {' · '}
                <Link to={`/vehicles/${encodeURIComponent(plate)}`} className="text-primary hover:underline">
                  {plate}
                </Link>
              </>
            )}
          </>
        );
      },
    },
  ];

  const salesFooter = (vis: Sale[]): ReactNode[] => {
    const sumOf = (f: (r: Sale) => number) => vis.reduce((s, r) => s + f(r), 0);
    return columns.map((col) => {
      if (col.key === 'date') return 'Итого';
      if (col.key === 'tonnage') return `${formatNumber(sumOf((r) => Number(r.tonnage)), 3)} т`;
      if (col.key === 'total_sum') return formatMoney(sumOf((r) => Number(r.total_sum)));
      if (col.key === 'margin_total') return formatMoney(sumOf((r) => (r.sale_type === 'CEMENT' ? Number(r.margin_total) : 0)));
      return null;
    });
  };
  return (
    <div>
      <PageHeader title="Продажи" subtitle="Цемент и логистика — единая форма" action={<Button onClick={openNew}>+ Новая продажа</Button>} />

      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} q={q} onQChange={setQ} qPlaceholder="Поиск по машине…">
        <PlainSelect
          value={clientFilter}
          onValueChange={setClientFilter}
          className="w-full sm:w-48"
          placeholder="Все клиенты"
          options={[{ value: '', label: 'Все клиенты' }, ...(clients.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <PlainSelect
          value={factoryFilter}
          onValueChange={setFactoryFilter}
          className="w-full sm:w-44"
          placeholder="Все заводы"
          options={[{ value: '', label: 'Все заводы' }, ...(factories.data ?? []).map((f) => ({ value: String(f.id), label: f.name }))]}
        />
        <PlainSelect
          value={zavodFilter}
          onValueChange={setZavodFilter}
          className="w-full sm:w-48"
          placeholder="Все поставщики"
          options={[{ value: '', label: 'Все поставщики' }, ...(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))]}
        />
        <PlainSelect
          value={typeFilter}
          onValueChange={setTypeFilter}
          className="w-full sm:w-40"
          placeholder="Все типы"
          options={[{ value: '', label: 'Все типы' }, ...SALE_TYPE_OPTIONS]}
        />
        <PlainSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full sm:w-48"
          placeholder="Все продажи"
          options={[
            { value: '', label: 'Все продажи' },
            { value: 'awaiting', label: 'Ждут отгрузки' },
            { value: 'unconfirmed', label: 'Ждём подтверждения клиента' },
            { value: 'delivered', label: 'Доставлены' },
            { value: 'undelivered', label: 'Не доставлены' },
            { value: 'deferred', label: 'Только отложенные' },
          ]}
        />
      </FilterBar>

      <DataTable footer={salesFooter} columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} extraRowAction={(r) =>
        r.awaiting_shipment ? (
          <Button variant="outline" size="sm" onClick={() => onShip(r)}>Отгрузить</Button>
        ) : r.client_id && !r.is_historical ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Доставка ▾</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDelivery(r, 'yes')}>Доставлен</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelivery(r, 'no')}>Не доставлен</DropdownMenuItem>
              {r.delivery_status && <DropdownMenuItem onClick={() => onDelivery(r, null)}>Снять отметку</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      } onEdit={openEdit} onDelete={(r) => (r.source === 'direct' ? notify('Эта продажа связана с приходом «Напрямую» — удалите её через Приход', 'error') : setDeleting(r))} />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новая продажа' : 'Изменить продажу'} onClose={() => setEditing(null)} widthClass="sm:max-w-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Тип продажи">
              <RHFButtonGroup control={control} name="sale_type" options={SALE_TYPE_OPTIONS} disabled={editing !== 'new'} />
            </FormRow>

            <RHFCheckbox control={control} name="awaiting_shipment" label="Заказ принят, ещё не отгружен" />

            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
              <RHFCheckbox control={control} name="is_deferred" label="Отложить: клиента и цену внесу позже" />
              <p className="mt-1 text-xs text-muted-foreground">
                {isDeferred
                  ? 'Цемент и машина записываются сейчас (остаток склада/тикета уменьшится). Клиента и цены заполните позже: откройте продажу, внесите данные и снимите эту галочку.'
                  : 'Если клиент или цена пока неизвестны — отметьте, и продажа сохранится как отложенная.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Дата">
                <Input type="date" {...register('date', { required: true })} />
              </FormRow>
              <FormRow label={isDeferred ? 'Клиент (необязательно)' : 'Клиент'} error={formState.errors.client_id?.message}>
                <RHFSelect control={control} name="client_id" options={clientOptions} />
              </FormRow>
            </div>
            <QuickAddClient onCreated={selectClient} />

            {saleType === 'CEMENT' ? (
              <>
                <FormRow label="Источник">
                  <RHFButtonGroup
                    control={control}
                    name="source"
                    options={[
                      { value: 'warehouse', label: 'Склад (Факт)' },
                      { value: 'ticket', label: 'Тикет биржи' },
                    ]}
                  />
                </FormRow>

                {source === 'ticket' ? (
                  <FormRow label="Тикет" error={formState.errors.ticket_id?.message}>
                    <RHFSelect
                      control={control}
                      name="ticket_id"
                      options={(tickets.data ?? []).map((t) => ({
                        value: String(t.id),
                        label: `${t.ticket_number} · ${t.zavod_name} · ${t.cement_mark_name} · ${PACKAGING_LABELS[t.packaging]} · остаток ${formatNumber(t.remaining_tonnage, 3)} т · цена покупки ${formatMoney(t.price_per_ton)}/т`,
                      }))}
                    />
                    {selectedTicket && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Завод/марка/упаковка зафиксированы тикетом: {selectedTicket.zavod_name}, {selectedTicket.cement_mark_name}, {PACKAGING_LABELS[selectedTicket.packaging]}. Цена покупки: {formatMoney(selectedTicket.price_per_ton)} за тонну
                      </p>
                    )}
                  </FormRow>
                ) : (
                  <>
                    <FormRow label="Поставщик" error={formState.errors.zavod_id?.message}>
                      <RHFSelect control={control} name="zavod_id" options={(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))} />
                    </FormRow>
                    <FormRow label="Марка цемента" error={formState.errors.cement_mark_id?.message}>
                      <RHFSelect
                        control={control}
                        name="cement_mark_id"
                        options={(cementMarks.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
                      />
                    </FormRow>
                    <FormRow label="Упаковка" error={formState.errors.packaging?.message}>
                      <RHFButtonGroup
                        control={control}
                        name="packaging"
                        options={[
                          { value: 'MESHOK', label: 'Мешок' },
                          { value: 'NAVAL', label: 'Навал' },
                        ]}
                      />
                    </FormRow>
                  </>
                )}

                <FormRow label="Завод" error={formState.errors.factory_id?.message}>
                  <RHFSelect control={control} name="factory_id" options={factoryOptions} />
                </FormRow>

                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                    <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
                  </FormRow>
                  <FormRow label="Цена за тонну" error={formState.errors.price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('price_per_ton', { required: isDeferred ? false : 'Укажите цену' })} />
                  </FormRow>
                </div>
                {source === 'warehouse' && currentBalance && (
                  <p className="-mt-2 text-xs text-muted-foreground">На складе доступно: {formatNumber(currentBalance.tonnage, 3)} т</p>
                )}

                <FormRow label="Тип машины">
                  <RHFButtonGroup control={control} name="vehicle_type" options={VEHICLE_TYPE_OPTIONS} />
                </FormRow>
                {vehicleType === 'CLIENT' && (
                  <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
                    <SuggestInput options={suggestions.data?.plates ?? []} {...register('machine_number', { required: 'Укажите номер машины' })} />
                  </FormRow>
                )}
                {vehicleType === 'OWN' && (
                  <>
                    <FormRow label="Машина" error={formState.errors.own_vehicle_id?.message}>
                      <RHFSelect control={control} name="own_vehicle_id" options={(machines.data ?? []).map((m) => ({ value: String(m.id), label: m.number }))} />
                    </FormRow>
                    <FormRow label="Цена перевозки за тонну" error={formState.errors.freight_price_per_ton?.message}>
                      <Input type="number" step="0.01" {...register('freight_price_per_ton')} />
                    </FormRow>
                  </>
                )}
                {vehicleType === 'HIRED' && (
                  <>
                    <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
                      <SuggestInput options={suggestions.data?.plates ?? []} {...register('machine_number', { required: 'Укажите номер машины' })} />
                    </FormRow>
                    <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                      <SuggestInput options={suggestions.data?.carriers ?? []} {...register('carrier_name', { required: 'Укажите перевозчика' })} />
                    </FormRow>
                    <FormRow label="Цена перевозки за тонну (клиенту)" error={formState.errors.freight_price_per_ton?.message}>
                      <Input type="number" step="0.01" {...register('freight_price_per_ton')} />
                    </FormRow>
                    <FormRow label="Цена найма за тонну (перевозчику)" error={formState.errors.hire_price_per_ton?.message}>
                      <Input type="number" step="0.01" {...register('hire_price_per_ton')} />
                    </FormRow>
                  </>
                )}
              </>
            ) : (
              <>
                <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
                  <SuggestInput options={suggestions.data?.plates ?? []} {...register('machine_number', { required: 'Укажите номер машины' })} placeholder="Определится: своя или наёмная" />
                </FormRow>
                <p className="-mt-2 text-xs text-muted-foreground">
                  {machineNumber ? (logisticsVehicleGuess === 'OWN' ? 'Своя машина (найдена в справочнике)' : 'Наёмная (номера нет в справочнике «Свои машины»)') : 'Введите номер — тип определится сам'}
                </p>
                {vehicleType === 'HIRED' && (
                  <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                    <SuggestInput options={suggestions.data?.carriers ?? []} {...register('carrier_name', { required: 'Укажите перевозчика' })} />
                  </FormRow>
                )}
                <FormRow label="Маршрут (необязательно)">
                  <SuggestInput {...register('route')} options={suggestions.data?.routes ?? []} placeholder="Откуда — куда" />
                </FormRow>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                    <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
                  </FormRow>
                  <FormRow label="Цена за тонну перевозки" error={formState.errors.freight_price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('freight_price_per_ton', { required: isDeferred ? false : 'Укажите цену' })} />
                  </FormRow>
                </div>
                {vehicleType === 'HIRED' && (
                  <FormRow label="Цена найма за тонну (перевозчику)" error={formState.errors.hire_price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('hire_price_per_ton', { required: isDeferred ? false : 'Укажите цену найма' })} />
                  </FormRow>
                )}
              </>
            )}

            <FormRow label="Комментарий (необязательно)">
              <Input {...register('comment')} />
            </FormRow>

            <div className="rounded-md bg-muted p-3 text-base font-semibold">Итого к оплате: {formatMoney(previewTotal)}</div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {deleting && (
        <ConfirmDialog title="Удалить продажу?" message="Остатки склада или тикета будут пересчитаны." onConfirm={onDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
