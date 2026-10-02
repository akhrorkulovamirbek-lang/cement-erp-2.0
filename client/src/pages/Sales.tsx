import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { cementMarksHooks, clientsHooks, machinesHooks, salesHooks, ticketsHooks, useWarehouseBalance, zavodyHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { QuickAddClient } from '@/components/QuickAddClient';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, PlainSelect, RHFSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { PACKAGING_LABELS, SALE_TYPE_OPTIONS, VEHICLE_TYPE_OPTIONS, VEHICLE_TYPE_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber, todayISO } from '@/lib/format';
import { normalizePlateNumber } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import type { Client, Sale } from '@/types';

interface FormValues {
  sale_type: 'CEMENT' | 'LOGISTICS';
  date: string;
  client_id: string;
  source: 'warehouse' | 'ticket' | '';
  ticket_id: string;
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
  sale_type: 'CEMENT',
  date: todayISO(),
  client_id: '',
  source: 'warehouse',
  ticket_id: '',
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

export function Sales() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const list = salesHooks.useList({
    from: from || undefined,
    to: to || undefined,
    client_id: clientFilter || undefined,
    sale_type: typeFilter || undefined,
  });
  const create = salesHooks.useCreate();
  const update = salesHooks.useUpdate();
  const del = salesHooks.useDelete();
  const clients = clientsHooks.useList();
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();
  const tickets = ticketsHooks.useList({ status: 'active' });
  const balance = useWarehouseBalance();
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
  const currentBalance = (balance.data ?? []).find(
    (b) => String(b.zavod_id) === zavodId && String(b.cement_mark_id) === cementMarkId && b.packaging === packaging,
  );

  // Логистика: своя/наёмная определяется по совпадению номера со справочником (раздел 3 ТЗ, п.3) —
  // подсказка на фронте, сервер решает окончательно сам.
  const ownMachineNumbers = new Set((machines.data ?? []).map((m) => m.number));
  const logisticsVehicleGuess = machineNumber && ownMachineNumbers.has(normalizePlateNumber(machineNumber)) ? 'OWN' : 'HIRED';

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
      sale_type: row.sale_type,
      date: row.date,
      client_id: String(row.client_id),
      source: row.source === 'ticket' ? 'ticket' : 'warehouse',
      ticket_id: row.ticket_id ? String(row.ticket_id) : '',
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
    const payload = {
      sale_type: data.sale_type,
      date: data.date,
      client_id: Number(data.client_id),
      source: data.sale_type === 'CEMENT' ? data.source : null,
      ticket_id: data.sale_type === 'CEMENT' && data.source === 'ticket' ? Number(data.ticket_id) : null,
      zavod_id: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? Number(data.zavod_id) : null,
      cement_mark_id: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? Number(data.cement_mark_id) : null,
      packaging: data.sale_type === 'CEMENT' && data.source === 'warehouse' ? data.packaging : null,
      price_per_ton: data.sale_type === 'CEMENT' ? Number(data.price_per_ton) : null,
      tonnage: Number(data.tonnage),
      // Для LOGISTICS сервер определяет своя/наёмная сам по номеру — это значение только чтобы
      // пройти валидацию формы (обязательное поле), сервер его игнорирует для этого типа.
      vehicle_type: data.vehicle_type,
      // own_vehicle_id — только для Цемента: для Логистики сервер сам находит машину по номеру.
      own_vehicle_id: data.sale_type === 'CEMENT' && data.vehicle_type === 'OWN' ? Number(data.own_vehicle_id) : null,
      machine_number: data.vehicle_type === 'OWN' && data.sale_type === 'CEMENT' ? null : data.machine_number || null,
      carrier_name: data.vehicle_type === 'HIRED' ? data.carrier_name || null : null,
      freight_price_per_ton: data.sale_type === 'LOGISTICS' || data.vehicle_type !== 'CLIENT' ? Number(data.freight_price_per_ton) : null,
      hire_price_per_ton: data.vehicle_type === 'HIRED' ? Number(data.hire_price_per_ton) : null,
      route: data.sale_type === 'LOGISTICS' ? data.route || null : null,
      comment: data.comment || null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Продажа добавлена');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload });
        notify('Сохранено');
      }
      setEditing(null);
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
    { key: 'client_name', header: 'Клиент' },
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
      render: (r) => formatMoney(r.total_sum),
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
        return `${VEHICLE_TYPE_LABELS[r.vehicle_type]}${plate ? ` · ${plate}` : ''}`;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Продажи" subtitle="Цемент и логистика — единая форма" action={<Button onClick={openNew}>+ Новая продажа</Button>} />

      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <PlainSelect
          value={clientFilter}
          onValueChange={setClientFilter}
          className="w-48"
          placeholder="Все клиенты"
          options={[{ value: '', label: 'Все клиенты' }, ...(clients.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <PlainSelect
          value={typeFilter}
          onValueChange={setTypeFilter}
          className="w-40"
          placeholder="Все типы"
          options={[{ value: '', label: 'Все типы' }, ...SALE_TYPE_OPTIONS]}
        />
      </FilterBar>

      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={(r) => (r.source === 'direct' ? notify('Эта продажа связана с приходом «Напрямую» — удалите её через Приход', 'error') : setDeleting(r))} />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новая продажа' : 'Изменить продажу'} onClose={() => setEditing(null)} widthClass="sm:max-w-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Тип продажи">
              <RHFButtonGroup control={control} name="sale_type" options={SALE_TYPE_OPTIONS} disabled={editing !== 'new'} />
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Дата">
                <Input type="date" {...register('date', { required: true })} />
              </FormRow>
              <FormRow label="Клиент" error={formState.errors.client_id?.message}>
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
                        label: `${t.ticket_number} · ${t.zavod_name} · ${t.cement_mark_name} · ${PACKAGING_LABELS[t.packaging]} · остаток ${formatNumber(t.remaining_tonnage, 3)} т`,
                      }))}
                    />
                    {selectedTicket && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Завод/марка/упаковка зафиксированы тикетом: {selectedTicket.zavod_name}, {selectedTicket.cement_mark_name}, {PACKAGING_LABELS[selectedTicket.packaging]}
                      </p>
                    )}
                  </FormRow>
                ) : (
                  <>
                    <FormRow label="Завод" error={formState.errors.zavod_id?.message}>
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

                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                    <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
                  </FormRow>
                  <FormRow label="Цена за тонну" error={formState.errors.price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('price_per_ton', { required: 'Укажите цену' })} />
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
                    <Input {...register('machine_number', { required: 'Укажите номер машины' })} />
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
                      <Input {...register('machine_number', { required: 'Укажите номер машины' })} />
                    </FormRow>
                    <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                      <Input {...register('carrier_name', { required: 'Укажите перевозчика' })} />
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
                  <Input {...register('machine_number', { required: 'Укажите номер машины' })} placeholder="Определится: своя или наёмная" />
                </FormRow>
                <p className="-mt-2 text-xs text-muted-foreground">
                  {machineNumber ? (logisticsVehicleGuess === 'OWN' ? 'Своя машина (найдена в справочнике)' : 'Наёмная (номера нет в справочнике «Свои машины»)') : 'Введите номер — тип определится сам'}
                </p>
                {vehicleType === 'HIRED' && (
                  <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                    <Input {...register('carrier_name', { required: 'Укажите перевозчика' })} />
                  </FormRow>
                )}
                <FormRow label="Маршрут (необязательно)">
                  <Input {...register('route')} placeholder="Откуда — куда" />
                </FormRow>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                    <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
                  </FormRow>
                  <FormRow label="Цена за тонну перевозки" error={formState.errors.freight_price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('freight_price_per_ton', { required: 'Укажите цену' })} />
                  </FormRow>
                </div>
                {vehicleType === 'HIRED' && (
                  <FormRow label="Цена найма за тонну (перевозчику)" error={formState.errors.hire_price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('hire_price_per_ton', { required: 'Укажите цену найма' })} />
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
