import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import {
  cementMarksHooks,
  clientsHooks,
  incomingHooks,
  machinesHooks,
  ticketsHooks,
  useBrokerAccount,
  useCloseTicket,
  useReplenishBroker,
  useWarehouseBalance,
  zavodyHooks,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { ButtonGroup, RHFButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { PageHeader } from '@/components/PageHeader';
import { QuickAddClient } from '@/components/QuickAddClient';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, PlainSelect, RHFSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PACKAGING_OPTIONS, VEHICLE_TYPE_OPTIONS, WAREHOUSE_OPTIONS, PACKAGING_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber, todayISO } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Incoming, IncomingWarehouse, Ticket } from '@/types';

interface FormValues {
  date: string;
  zavod_id: string;
  cement_mark_id: string;
  packaging: 'MESHOK' | 'NAVAL';
  tonnage: string;
  price_per_ton: string;
  machine_number: string;
  comment: string;
  client_id: string;
  sale_price_per_ton: string;
  vehicle_type: 'CLIENT' | 'OWN' | 'HIRED' | '';
  own_vehicle_id: string;
  sale_machine_number: string;
  carrier_name: string;
  freight_price_per_ton: string;
  hire_price_per_ton: string;
}

const emptyForm = (): FormValues => ({
  date: todayISO(),
  zavod_id: '',
  cement_mark_id: '',
  packaging: 'MESHOK',
  tonnage: '',
  price_per_ton: '',
  machine_number: '',
  comment: '',
  client_id: '',
  sale_price_per_ton: '',
  vehicle_type: '',
  own_vehicle_id: '',
  sale_machine_number: '',
  carrier_name: '',
  freight_price_per_ton: '',
  hire_price_per_ton: '',
});

interface TicketFormValues {
  date: string;
  ticket_number: string;
  zavod_id: string;
  cement_mark_id: string;
  packaging: 'MESHOK' | 'NAVAL';
  tonnage: string;
  price_per_ton: string;
}

const emptyTicketForm = (): TicketFormValues => ({
  date: todayISO(),
  ticket_number: '',
  zavod_id: '',
  cement_mark_id: '',
  packaging: 'MESHOK',
  tonnage: '',
  price_per_ton: '',
});

export function IncomingPage() {
  const { notify } = useToast();

  // Справочники, используемые по всей странице
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();
  const clients = clientsHooks.useList();
  const machines = machinesHooks.useList();
  const balance = useWarehouseBalance();

  // --- История приходов (Факт/Напрямую) ---
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [zavodFilter, setZavodFilter] = useState('');
  const [q, setQ] = useState('');
  const list = incomingHooks.useList({ from: from || undefined, to: to || undefined, zavod_id: zavodFilter || undefined, q: q || undefined });
  const create = incomingHooks.useCreate();
  const update = incomingHooks.useUpdate();
  const del = incomingHooks.useDelete();

  const [editing, setEditing] = useState<Incoming | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Incoming | null>(null);
  const [warehouse, setWarehouse] = useState<IncomingWarehouse | 'TICKET'>('FACT');
  const { register, control, handleSubmit, reset, watch, formState } = useForm<FormValues>({ defaultValues: emptyForm() });
  const vehicleType = watch('vehicle_type');

  const ticketForm = useForm<TicketFormValues>({ defaultValues: emptyTicketForm() });

  function openNew() {
    reset(emptyForm());
    ticketForm.reset(emptyTicketForm());
    setWarehouse('FACT');
    setEditing('new');
  }
  function openEdit(row: Incoming) {
    reset({
      date: row.date,
      zavod_id: String(row.zavod_id),
      cement_mark_id: String(row.cement_mark_id),
      packaging: row.packaging,
      tonnage: row.tonnage,
      price_per_ton: row.price_per_ton,
      machine_number: row.machine_number ?? '',
      comment: row.comment ?? '',
      client_id: '',
      sale_price_per_ton: '',
      vehicle_type: '',
      own_vehicle_id: '',
      sale_machine_number: '',
      carrier_name: '',
      freight_price_per_ton: '',
      hire_price_per_ton: '',
    });
    setWarehouse(row.warehouse);
    setEditing(row);
  }

  async function onSubmitIncoming(data: FormValues) {
    const payload = {
      date: data.date,
      warehouse,
      zavod_id: Number(data.zavod_id),
      cement_mark_id: Number(data.cement_mark_id),
      packaging: data.packaging,
      tonnage: Number(data.tonnage),
      price_per_ton: Number(data.price_per_ton),
      machine_number: data.machine_number || null,
      comment: data.comment || null,
      client_id: warehouse === 'DIRECT' ? Number(data.client_id) : null,
      sale_price_per_ton: warehouse === 'DIRECT' ? Number(data.sale_price_per_ton) : null,
      vehicle_type: warehouse === 'DIRECT' ? data.vehicle_type || null : null,
      own_vehicle_id: warehouse === 'DIRECT' && data.vehicle_type === 'OWN' ? Number(data.own_vehicle_id) : null,
      sale_machine_number: warehouse === 'DIRECT' && data.vehicle_type !== 'OWN' ? data.sale_machine_number : null,
      carrier_name: warehouse === 'DIRECT' && data.vehicle_type === 'HIRED' ? data.carrier_name : null,
      freight_price_per_ton:
        warehouse === 'DIRECT' && data.vehicle_type !== 'CLIENT' ? Number(data.freight_price_per_ton) : null,
      hire_price_per_ton: warehouse === 'DIRECT' && data.vehicle_type === 'HIRED' ? Number(data.hire_price_per_ton) : null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Приход добавлен');
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

  const tonnageNum = Number(watch('tonnage')) || 0;
  const salePriceNum = Number(watch('sale_price_per_ton')) || 0;
  const freightNum = Number(watch('freight_price_per_ton')) || 0;
  const directTotal =
    tonnageNum * salePriceNum + (vehicleType && vehicleType !== 'CLIENT' ? tonnageNum * freightNum : 0);

  const columns: Column<Incoming>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'warehouse',
      header: 'Склад',
      render: (r) => (r.warehouse === 'DIRECT' ? <Badge tone="amber">Напрямую</Badge> : <Badge tone="slate">Факт</Badge>),
    },
    { key: 'zavod_name', header: 'Завод' },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'packaging', header: 'Упаковка', render: (r) => PACKAGING_LABELS[r.packaging] },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 3)} т`,
    },
    {
      key: 'price_per_ton',
      header: 'Цена/т',
      align: 'right',
      sortValue: (r) => Number(r.price_per_ton),
      render: (r) => formatMoney(r.price_per_ton),
    },
    {
      key: 'total_sum',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.total_sum),
      render: (r) => formatMoney(r.total_sum),
    },
  ];

  // --- Брокерский счёт и тикеты (объединено с бывшей страницей «Биржа») ---
  const broker = useBrokerAccount();
  const replenish = useReplenishBroker();
  const tickets = ticketsHooks.useList();
  const updateTicket = ticketsHooks.useUpdate();
  const deleteTicket = ticketsHooks.useDelete();
  const closeTicket = useCloseTicket();

  const [showReplenish, setShowReplenish] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const [closingTicket, setClosingTicket] = useState<Ticket | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const replenishForm = useForm<{ date: string; amount: string; description: string }>({
    defaultValues: { date: todayISO(), amount: '', description: '' },
  });

  async function onReplenish(data: { date: string; amount: string; description: string }) {
    try {
      await replenish.mutateAsync({ date: data.date, amount: Number(data.amount), description: data.description || undefined });
      notify('Счёт пополнен');
      setShowReplenish(false);
      replenishForm.reset({ date: todayISO(), amount: '', description: '' });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  function openEditTicket(t: Ticket) {
    ticketForm.reset({
      date: t.date,
      ticket_number: t.ticket_number,
      zavod_id: String(t.zavod_id),
      cement_mark_id: String(t.cement_mark_id),
      packaging: t.packaging,
      tonnage: t.bought_tonnage,
      price_per_ton: t.price_per_ton,
    });
    setEditingTicket(t);
  }

  const createTicket = ticketsHooks.useCreate();

  async function onCreateOrEditTicket(data: TicketFormValues) {
    try {
      if (editingTicket) {
        await updateTicket.mutateAsync({
          id: editingTicket.id,
          data: {
            ticket_number: data.ticket_number,
            zavod_id: Number(data.zavod_id),
            cement_mark_id: Number(data.cement_mark_id),
            price_per_ton: Number(data.price_per_ton),
          },
        });
        notify('Тикет обновлён');
        setEditingTicket(null);
      } else {
        await createTicket.mutateAsync({
          date: data.date,
          ticket_number: data.ticket_number,
          zavod_id: Number(data.zavod_id),
          cement_mark_id: Number(data.cement_mark_id),
          packaging: data.packaging,
          tonnage: Number(data.tonnage),
          price_per_ton: Number(data.price_per_ton),
        });
        notify('Тикет куплен');
        setEditing(null);
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onDeleteTicket() {
    if (!deletingTicket) return;
    try {
      await deleteTicket.mutateAsync(deletingTicket.id);
      notify('Тикет удалён');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setDeletingTicket(null);
    }
  }

  async function onCloseTicket() {
    if (!closingTicket) return;
    try {
      await closeTicket.mutateAsync(closingTicket.id);
      notify('Тикет закрыт, остаток возвращён на счёт');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setClosingTicket(null);
    }
  }

  const ticketColumns: Column<Ticket>[] = [
    { key: 'ticket_number', header: 'Номер', sortValue: (r) => r.ticket_number },
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'zavod_name', header: 'Завод' },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'packaging', header: 'Упаковка', render: (r) => PACKAGING_LABELS[r.packaging] },
    {
      key: 'bought_tonnage',
      header: 'Куплено, т',
      align: 'right',
      sortValue: (r) => Number(r.bought_tonnage),
      render: (r) => formatNumber(r.bought_tonnage, 3),
    },
    {
      key: 'remaining_tonnage',
      header: 'Остаток, т',
      align: 'right',
      sortValue: (r) => Number(r.remaining_tonnage),
      render: (r) => formatNumber(r.remaining_tonnage, 3),
    },
    {
      key: 'remaining_sum',
      header: 'Остаток, сум',
      align: 'right',
      sortValue: (r) => Number(r.remaining_sum),
      render: (r) => formatMoney(r.remaining_sum),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (r) => (r.status === 'active' ? <Badge tone="green">Активен</Badge> : <Badge tone="slate">Закрыт</Badge>),
    },
  ];

  const warehouseOptions = editing === 'new' ? WAREHOUSE_OPTIONS : WAREHOUSE_OPTIONS.filter((o) => o.value !== 'TICKET');
  const summaryLine =
    editing && warehouse !== 'TICKET' && watch('cement_mark_id')
      ? `${warehouse === 'DIRECT' ? 'Напрямую' : 'Факт'} · ${cementMarks.data?.find((m) => String(m.id) === watch('cement_mark_id'))?.name ?? ''} · ${PACKAGING_LABELS[watch('packaging')]} · ${formatNumber(watch('tonnage') || 0, 3)} т`
      : '';

  return (
    <div>
      <PageHeader
        title="Приход"
        subtitle="Закупки на склад, напрямую клиенту и по тикетам биржи"
        action={<Button onClick={openNew}>+ Добавить приход</Button>}
      />

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Остатки на складе (Факт)</h2>
        {(balance.data ?? []).length === 0 && !balance.isLoading ? (
          <p className="text-sm text-muted-foreground">Склад пуст</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(balance.data ?? []).map((b) => (
              <Card key={b.id}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">
                    {b.zavod_name} · {b.cement_mark_name} · {PACKAGING_LABELS[b.packaging]}
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(b.tonnage, 3)} т</div>
                  <div className="text-xs text-muted-foreground">сред. себест. {formatMoney(b.avg_cost_per_ton)}/т</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold">История приходов</h2>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} q={q} onQChange={setQ} qPlaceholder="Номер машины…">
        <PlainSelect
          value={zavodFilter}
          onValueChange={setZavodFilter}
          className="w-48"
          placeholder="Все заводы"
          options={[{ value: '', label: 'Все заводы' }, ...(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))]}
        />
      </FilterBar>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      <div className="mt-8 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Брокерский счёт и тикеты</h2>
          <div className="flex items-center gap-2">
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Скрыть историю операций' : 'История операций'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowReplenish(true)}>
              + Пополнить счёт
            </Button>
          </div>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Баланс брокерского счёта</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(broker.data?.account.balance ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Активных тикетов</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {String((tickets.data ?? []).filter((t) => t.status === 'active').length)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Остаток тоннажа по тикетам</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatNumber(
                  (tickets.data ?? []).filter((t) => t.status === 'active').reduce((s, t) => s + Number(t.remaining_tonnage), 0),
                  3,
                )}{' '}
                т
              </div>
            </CardContent>
          </Card>
        </div>

        {showHistory && (
          <Card className="mb-4">
            <CardContent className="max-h-64 space-y-1.5 overflow-y-auto p-3 text-xs">
              {(broker.data?.operations ?? []).map((op) => (
                <div key={op.id} className="flex justify-between border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground">
                    {formatDate(op.date)} — {op.description ?? op.type}
                  </span>
                  <span className={op.type === 'ticket_purchase' ? 'text-destructive' : 'text-success'}>
                    {op.type === 'ticket_purchase' ? '-' : '+'}
                    {formatMoney(op.amount)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <DataTable
          columns={ticketColumns}
          rows={tickets.data ?? []}
          loading={tickets.isLoading}
          getRowId={(r) => r.id}
          onEdit={openEditTicket}
          onDelete={setDeletingTicket}
          extraRowAction={(r) =>
            r.status === 'active' ? (
              <Button variant="ghost" size="icon" onClick={() => setClosingTicket(r)} aria-label="Закрыть тикет">
                <Lock className="size-4" />
              </Button>
            ) : null
          }
        />
      </div>

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новый приход' : 'Изменить приход'} onClose={() => setEditing(null)} widthClass="sm:max-w-lg">
          <div className="mb-4">
            <ButtonGroup value={warehouse} onChange={(v) => setWarehouse(v as IncomingWarehouse | 'TICKET')} options={warehouseOptions} />
          </div>

          {warehouse === 'TICKET' ? (
            <form onSubmit={ticketForm.handleSubmit(onCreateOrEditTicket)} className="space-y-4">
              <FormRow label="Дата">
                <Input type="date" {...ticketForm.register('date', { required: true })} />
              </FormRow>
              <FormRow label="Номер тикета" error={ticketForm.formState.errors.ticket_number?.message}>
                <Input {...ticketForm.register('ticket_number', { required: 'Укажите номер' })} placeholder="Cesam-001" />
              </FormRow>
              <FormRow label="Завод" error={ticketForm.formState.errors.zavod_id?.message}>
                <RHFSelect
                  control={ticketForm.control}
                  name="zavod_id"
                  options={(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))}
                />
              </FormRow>
              <FormRow label="Марка цемента" error={ticketForm.formState.errors.cement_mark_id?.message}>
                <RHFSelect
                  control={ticketForm.control}
                  name="cement_mark_id"
                  options={(cementMarks.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
                />
              </FormRow>
              <FormRow label="Упаковка">
                <RHFButtonGroup control={ticketForm.control} name="packaging" options={PACKAGING_OPTIONS} />
              </FormRow>
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Тоннаж" error={ticketForm.formState.errors.tonnage?.message}>
                  <Input type="number" step="0.001" {...ticketForm.register('tonnage', { required: 'Укажите тоннаж' })} />
                </FormRow>
                <FormRow label="Цена за тонну" error={ticketForm.formState.errors.price_per_ton?.message}>
                  <Input type="number" step="0.01" {...ticketForm.register('price_per_ton', { required: 'Укажите цену' })} />
                </FormRow>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={ticketForm.formState.isSubmitting}>
                  Купить тикет
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmitIncoming)} className="space-y-4">
              <FormRow label="Дата">
                <Input type="date" {...register('date', { required: true })} />
              </FormRow>
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
              <FormRow label="Упаковка">
                <RHFButtonGroup control={control} name="packaging" options={PACKAGING_OPTIONS} />
              </FormRow>
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                  <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
                </FormRow>
                <FormRow label="Цена закупки за тонну" error={formState.errors.price_per_ton?.message}>
                  <Input type="number" step="0.01" {...register('price_per_ton', { required: 'Укажите цену' })} />
                </FormRow>
              </div>
              <FormRow label="Номер машины (необязательно)">
                <Input {...register('machine_number')} />
              </FormRow>

              {warehouse === 'DIRECT' && (
                <div className="space-y-4 rounded-md bg-muted p-3">
                  <FormRow label="Клиент" error={formState.errors.client_id?.message}>
                    <RHFSelect control={control} name="client_id" options={(clients.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} />
                    <div className="mt-1">
                      <QuickAddClient onCreated={(c) => reset({ ...watch(), client_id: String(c.id) })} />
                    </div>
                  </FormRow>
                  <FormRow label="Цена продажи за тонну" error={formState.errors.sale_price_per_ton?.message}>
                    <Input type="number" step="0.01" {...register('sale_price_per_ton', { required: 'Укажите цену продажи' })} />
                  </FormRow>
                  <FormRow label="Тип машины">
                    <RHFButtonGroup control={control} name="vehicle_type" options={VEHICLE_TYPE_OPTIONS} />
                  </FormRow>
                  {vehicleType === 'CLIENT' && (
                    <FormRow label="Номер машины">
                      <Input {...register('sale_machine_number')} />
                    </FormRow>
                  )}
                  {vehicleType === 'OWN' && (
                    <>
                      <FormRow label="Машина" error={formState.errors.own_vehicle_id?.message}>
                        <RHFSelect
                          control={control}
                          name="own_vehicle_id"
                          options={(machines.data ?? []).map((m) => ({ value: String(m.id), label: m.number }))}
                        />
                      </FormRow>
                      <FormRow label="Цена перевозки за тонну" error={formState.errors.freight_price_per_ton?.message}>
                        <Input type="number" step="0.01" {...register('freight_price_per_ton')} />
                      </FormRow>
                    </>
                  )}
                  {vehicleType === 'HIRED' && (
                    <>
                      <FormRow label="Номер машины" error={formState.errors.sale_machine_number?.message}>
                        <Input {...register('sale_machine_number')} />
                      </FormRow>
                      <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                        <Input {...register('carrier_name')} />
                      </FormRow>
                      <FormRow label="Цена перевозки за тонну (клиенту)" error={formState.errors.freight_price_per_ton?.message}>
                        <Input type="number" step="0.01" {...register('freight_price_per_ton')} />
                      </FormRow>
                      <FormRow label="Цена найма за тонну (перевозчику)" error={formState.errors.hire_price_per_ton?.message}>
                        <Input type="number" step="0.01" {...register('hire_price_per_ton')} />
                      </FormRow>
                    </>
                  )}
                  {vehicleType && (
                    <div className="rounded-md bg-background p-2 text-sm font-semibold">
                      Итого к оплате клиентом: {formatMoney(directTotal)}
                    </div>
                  )}
                </div>
              )}

              {summaryLine && <p className="text-xs text-muted-foreground">{summaryLine}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={formState.isSubmitting}>
                  Сохранить
                </Button>
              </div>
            </form>
          )}
        </SidePanel>
      )}

      {deleting && (
        <ConfirmDialog
          title="Удалить приход?"
          message={
            deleting.warehouse === 'DIRECT'
              ? 'Это удалит и связанную продажу «Напрямую». Остатки склада не изменятся.'
              : 'Остатки склада и связанные продажи будут пересчитаны.'
          }
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {editingTicket && (
        <SidePanel title="Изменить тикет" onClose={() => setEditingTicket(null)}>
          <form onSubmit={ticketForm.handleSubmit(onCreateOrEditTicket)} className="space-y-4">
            <FormRow label="Номер тикета" error={ticketForm.formState.errors.ticket_number?.message}>
              <Input {...ticketForm.register('ticket_number', { required: 'Укажите номер' })} />
            </FormRow>
            <FormRow label="Завод" error={ticketForm.formState.errors.zavod_id?.message}>
              <RHFSelect control={ticketForm.control} name="zavod_id" options={(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))} />
            </FormRow>
            <FormRow label="Марка цемента" error={ticketForm.formState.errors.cement_mark_id?.message}>
              <RHFSelect
                control={ticketForm.control}
                name="cement_mark_id"
                options={(cementMarks.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
              />
            </FormRow>
            <FormRow label="Тоннаж">
              <Input type="number" step="0.001" {...ticketForm.register('tonnage')} disabled />
            </FormRow>
            <FormRow label="Цена за тонну" error={ticketForm.formState.errors.price_per_ton?.message}>
              <Input type="number" step="0.01" {...ticketForm.register('price_per_ton', { required: 'Укажите цену' })} />
            </FormRow>
            <p className="text-xs text-muted-foreground">Тоннаж нельзя изменить после покупки. Изменение цены пересчитает маржу по продажам с этого тикета.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingTicket(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={ticketForm.formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {showReplenish && (
        <SidePanel title="Пополнить брокерский счёт" onClose={() => setShowReplenish(false)}>
          <form onSubmit={replenishForm.handleSubmit(onReplenish)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...replenishForm.register('date', { required: true })} />
            </FormRow>
            <FormRow label="Сумма, сум" error={replenishForm.formState.errors.amount?.message}>
              <Input type="number" step="0.01" {...replenishForm.register('amount', { required: 'Укажите сумму' })} />
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Input {...replenishForm.register('description')} />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowReplenish(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={replenishForm.formState.isSubmitting}>
                Пополнить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {deletingTicket && (
        <ConfirmDialog
          title="Удалить тикет?"
          message={`Удалить тикет «${deletingTicket.ticket_number}»? Возможно только если с него не было продаж — деньги вернутся на счёт.`}
          onConfirm={onDeleteTicket}
          onCancel={() => setDeletingTicket(null)}
        />
      )}

      {closingTicket && (
        <ConfirmDialog
          title="Закрыть тикет?"
          message={`Остаток тикета «${closingTicket.ticket_number}» (${formatNumber(closingTicket.remaining_tonnage, 3)} т, ${formatMoney(closingTicket.remaining_sum)}) будет автоматически возвращён на брокерский счёт.`}
          confirmLabel="Закрыть"
          danger={false}
          onConfirm={onCloseTicket}
          onCancel={() => setClosingTicket(null)}
        />
      )}
    </div>
  );
}
