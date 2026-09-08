import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterBar } from '../components/FilterBar';
import { Button, Checkbox, FormRow, Input, Select } from '../components/form';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { formatDate, formatMoney, formatNumber, todayISO } from '../lib/format';
import { logisticsHooks, clientsHooks } from '../api/modules';
import type { Logistics } from '../types';

interface FormValues {
  date: string;
  machine_number: string;
  machine_own: boolean;
  tonnage: string;
  price_per_ton: string;
  client_id: string;
}

const emptyForm = (): FormValues => ({ date: todayISO(), machine_number: '', machine_own: true, tonnage: '', price_per_ton: '', client_id: '' });

export function LogisticsPage() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const list = logisticsHooks.useList({ from: from || undefined, to: to || undefined, client_id: clientFilter || undefined });
  const create = logisticsHooks.useCreate();
  const update = logisticsHooks.useUpdate();
  const del = logisticsHooks.useDelete();
  const clients = clientsHooks.useList();

  const [editing, setEditing] = useState<Logistics | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Logistics | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Logistics) {
    reset({
      date: row.date,
      machine_number: row.machine_number,
      machine_own: row.machine_own,
      tonnage: row.tonnage,
      price_per_ton: row.price_per_ton,
      client_id: row.client_id ? String(row.client_id) : '',
    });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const payload = {
      date: data.date,
      machine_number: data.machine_number,
      machine_own: data.machine_own,
      tonnage: Number(data.tonnage),
      price_per_ton: Number(data.price_per_ton),
      client_id: data.client_id ? Number(data.client_id) : null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload as never);
        notify('Услуга добавлена');
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

  const columns: Column<Logistics>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'client_name', header: 'Клиент', render: (r) => r.client_name || '—' },
    { key: 'machine_number', header: 'Машина', render: (r) => `${r.machine_number}${r.machine_own ? '' : ' (наёмная)'}` },
    { key: 'tonnage', header: 'Тоннаж', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => `${formatNumber(r.tonnage, 2)} т` },
    { key: 'price_per_ton', header: 'Цена/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton) },
    { key: 'total_sum', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.total_sum), render: (r) => formatMoney(r.total_sum) },
  ];

  return (
    <div>
      <PageHeader title="Логистика" subtitle="Самостоятельные услуги перевозки" action={<Button onClick={openNew}>+ Новая услуга</Button>} />

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
        <Modal title={editing === 'new' ? 'Новая услуга логистики' : 'Изменить услугу'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Клиент (необязательно)">
              <Select {...register('client_id')}>
                <option value="">—</option>
                {(clients.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
              <Input {...register('machine_number', { required: 'Укажите номер машины' })} />
            </FormRow>
            <Checkbox label="Своя машина" {...register('machine_own')} />
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Тоннаж" error={formState.errors.tonnage?.message}>
                <Input type="number" step="0.001" {...register('tonnage', { required: 'Укажите тоннаж' })} />
              </FormRow>
              <FormRow label="Цена за тонну" error={formState.errors.price_per_ton?.message}>
                <Input type="number" step="0.01" {...register('price_per_ton', { required: 'Укажите цену' })} />
              </FormRow>
            </div>
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

      {deleting && <ConfirmDialog title="Удалить услугу?" message="Это действие нельзя отменить." onConfirm={onDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
