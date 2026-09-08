import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Badge } from '../components/Badge';
import { FilterBar } from '../components/FilterBar';
import { Button, Checkbox, FormRow, Input, Select } from '../components/form';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { formatDate, formatMoney, formatNumber, todayISO } from '../lib/format';
import { salesHooks, clientsHooks, cementMarksHooks, ticketsHooks, useWarehouseBalance } from '../api/modules';
import type { Sale } from '../types';

interface FormValues {
  date: string;
  client_id: string;
  source: 'warehouse' | 'ticket';
  ticket_id: string;
  cement_mark_id: string;
  type: 'рассыпной' | 'мешок';
  tonnage: string;
  price_per_ton: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  has_logistics: boolean;
  machine_number: string;
  machine_own: boolean;
  logistics_price_per_ton: string;
}

const emptyForm = (): FormValues => ({
  date: todayISO(),
  client_id: '',
  source: 'warehouse',
  ticket_id: '',
  cement_mark_id: '',
  type: 'рассыпной',
  tonnage: '',
  price_per_ton: '',
  currency: 'UZS',
  usd_rate: '',
  has_logistics: false,
  machine_number: '',
  machine_own: true,
  logistics_price_per_ton: '',
});

export function Sales() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const list = salesHooks.useList({ from: from || undefined, to: to || undefined, client_id: clientFilter || undefined });
  const create = salesHooks.useCreate();
  const update = salesHooks.useUpdate();
  const del = salesHooks.useDelete();
  const clients = clientsHooks.useList();
  const cementMarks = cementMarksHooks.useList();
  const tickets = ticketsHooks.useList({ status: 'active' });
  const balance = useWarehouseBalance();

  const [editing, setEditing] = useState<Sale | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Sale | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  const source = watch('source');
  const currency = watch('currency');
  const hasLogistics = watch('has_logistics');
  const ticketId = watch('ticket_id');
  const cementMarkId = watch('cement_mark_id');
  const type = watch('type');

  const selectedTicket = (tickets.data ?? []).find((t) => String(t.id) === ticketId);
  const currentBalance = (balance.data ?? []).find((b) => String(b.cement_mark_id) === cementMarkId && b.type === type);

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Sale) {
    reset({
      date: row.date,
      client_id: String(row.client_id),
      source: row.source,
      ticket_id: row.ticket_id ? String(row.ticket_id) : '',
      cement_mark_id: String(row.cement_mark_id),
      type: row.type,
      tonnage: row.tonnage,
      price_per_ton: row.price_per_ton,
      currency: row.currency,
      usd_rate: row.usd_rate ?? '',
      has_logistics: row.has_logistics,
      machine_number: row.machine_number ?? '',
      machine_own: row.machine_own ?? true,
      logistics_price_per_ton: row.logistics_price_per_ton ?? '',
    });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const ticket = (tickets.data ?? []).find((t) => String(t.id) === data.ticket_id);
    const payload = {
      date: data.date,
      client_id: Number(data.client_id),
      source: data.source,
      ticket_id: data.source === 'ticket' ? Number(data.ticket_id) : null,
      cement_mark_id: data.source === 'ticket' && ticket ? ticket.cement_mark_id : Number(data.cement_mark_id),
      type: data.type,
      tonnage: Number(data.tonnage),
      price_per_ton: Number(data.price_per_ton),
      currency: data.currency,
      usd_rate: data.currency === 'USD' ? Number(data.usd_rate) : null,
      has_logistics: data.has_logistics,
      machine_number: data.has_logistics ? data.machine_number : null,
      machine_own: data.has_logistics ? data.machine_own : null,
      logistics_price_per_ton: data.has_logistics ? Number(data.logistics_price_per_ton) : null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload as never);
        notify('Продажа добавлена');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload as never });
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

  const columns: Column<Sale>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'client_name', header: 'Клиент' },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'type', header: 'Тип' },
    { key: 'tonnage', header: 'Тоннаж', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => `${formatNumber(r.tonnage, 2)} т` },
    { key: 'price_per_ton', header: 'Цена/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton, r.currency) },
    { key: 'total_sum', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.total_sum), render: (r) => formatMoney(r.total_sum, r.currency) },
    { key: 'margin_total', header: 'Маржа', align: 'right', sortValue: (r) => Number(r.margin_total), render: (r) => formatMoney(r.margin_total) },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => (r.source === 'ticket' ? <Badge tone="blue">{r.ticket_number}</Badge> : <Badge tone="slate">Склад</Badge>),
    },
    {
      key: 'has_logistics',
      header: 'Логистика',
      render: (r) => (r.has_logistics ? <Badge tone="amber">{formatMoney(r.logistics_total ?? 0)}</Badge> : '—'),
    },
  ];

  return (
    <div>
      <PageHeader title="Продажи" subtitle="Со склада и с тикетов биржи" action={<Button onClick={openNew}>+ Новая продажа</Button>} />

      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="!w-48">
          <option value="">Все клиенты</option>
          {(clients.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новая продажа' : 'Изменить продажу'} onClose={() => setEditing(null)} widthClass="max-w-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Дата">
                <Input type="date" {...register('date', { required: true })} />
              </FormRow>
              <FormRow label="Клиент" error={formState.errors.client_id?.message}>
                <Select {...register('client_id', { required: 'Выберите клиента' })}>
                  <option value="">—</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
            </div>

            <FormRow label="Источник">
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" value="warehouse" {...register('source')} /> Склад
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" value="ticket" {...register('source')} /> Тикет биржи
                </label>
              </div>
            </FormRow>

            {source === 'ticket' ? (
              <FormRow label="Тикет" error={formState.errors.ticket_id?.message}>
                <Select {...register('ticket_id', { required: 'Выберите тикет' })}>
                  <option value="">—</option>
                  {(tickets.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.ticket_number} · {t.cement_mark_name} · остаток {formatNumber(t.remaining_tonnage, 2)} т
                    </option>
                  ))}
                </Select>
                {selectedTicket && <p className="mt-1 text-xs text-slate-400">Марка фиксирована тикетом: {selectedTicket.cement_mark_name}</p>}
              </FormRow>
            ) : (
              <FormRow label="Марка цемента" error={formState.errors.cement_mark_id?.message}>
                <Select {...register('cement_mark_id', { required: 'Выберите марку' })}>
                  <option value="">—</option>
                  {(cementMarks.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}

            <FormRow label="Тип">
              <Select {...register('type', { required: true })}>
                <option value="рассыпной">Рассыпной</option>
                <option value="мешок">Мешок</option>
              </Select>
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
              </FormRow>
              <FormRow label="Цена за тонну" error={formState.errors.price_per_ton?.message}>
                <Input type="number" step="0.01" {...register('price_per_ton', { required: 'Укажите цену' })} />
              </FormRow>
            </div>
            {source === 'warehouse' && currentBalance && (
              <p className="-mt-2 text-xs text-slate-400">На складе доступно: {formatNumber(currentBalance.tonnage, 2)} т</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Валюта">
                <Select {...register('currency', { required: true })}>
                  <option value="UZS">UZS (сум)</option>
                  <option value="USD">USD</option>
                </Select>
              </FormRow>
              {currency === 'USD' && (
                <FormRow label="Курс доллара" error={formState.errors.usd_rate?.message}>
                  <Input type="number" step="0.01" {...register('usd_rate', { required: 'Укажите курс' })} />
                </FormRow>
              )}
            </div>

            <Checkbox label="С доставкой (логистика)" {...register('has_logistics')} />
            {hasLogistics && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
                  <Input {...register('machine_number', { required: hasLogistics ? 'Укажите номер машины' : false })} />
                </FormRow>
                <Checkbox label="Своя машина" {...register('machine_own')} />
                <FormRow label="Цена доставки за тонну" error={formState.errors.logistics_price_per_ton?.message}>
                  <Input type="number" step="0.01" {...register('logistics_price_per_ton', { required: hasLogistics ? 'Укажите цену' : false })} />
                </FormRow>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title="Удалить продажу?" message="Остатки склада или тикета будут пересчитаны." onConfirm={onDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
