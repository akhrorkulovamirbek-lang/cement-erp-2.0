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
import { incomingHooks, zavodyHooks, cementMarksHooks, useWarehouseBalance } from '../api/modules';
import type { Incoming } from '../types';

interface FormValues {
  date: string;
  machine_number: string;
  machine_own: boolean;
  cement_mark_id: string;
  type: 'рассыпной' | 'мешок';
  tonnage: string;
  price_per_ton: string;
  zavod_id: string;
}

const emptyForm = (): FormValues => ({
  date: todayISO(),
  machine_number: '',
  machine_own: true,
  cement_mark_id: '',
  type: 'рассыпной',
  tonnage: '',
  price_per_ton: '',
  zavod_id: '',
});

export function IncomingPage() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [zavodFilter, setZavodFilter] = useState('');
  const [q, setQ] = useState('');
  const list = incomingHooks.useList({ from: from || undefined, to: to || undefined, zavod_id: zavodFilter || undefined, q: q || undefined });
  const create = incomingHooks.useCreate();
  const update = incomingHooks.useUpdate();
  const del = incomingHooks.useDelete();
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();
  const balance = useWarehouseBalance();

  const [editing, setEditing] = useState<Incoming | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Incoming | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Incoming) {
    reset({
      date: row.date,
      machine_number: row.machine_number,
      machine_own: row.machine_own,
      cement_mark_id: String(row.cement_mark_id),
      type: row.type,
      tonnage: row.tonnage,
      price_per_ton: row.price_per_ton,
      zavod_id: String(row.zavod_id),
    });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const payload = {
      date: data.date,
      machine_number: data.machine_number,
      machine_own: data.machine_own,
      cement_mark_id: Number(data.cement_mark_id),
      type: data.type,
      tonnage: Number(data.tonnage),
      price_per_ton: Number(data.price_per_ton),
      zavod_id: Number(data.zavod_id),
      warehouse_received: true,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload as never);
        notify('Приход добавлен');
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

  const columns: Column<Incoming>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'zavod_name', header: 'Завод' },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'type', header: 'Тип' },
    { key: 'machine_number', header: 'Машина', render: (r) => `${r.machine_number}${r.machine_own ? '' : ' (наёмная)'}` },
    { key: 'tonnage', header: 'Тоннаж', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => `${formatNumber(r.tonnage, 2)} т` },
    { key: 'price_per_ton', header: 'Цена/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton) },
    { key: 'total_sum', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.total_sum), render: (r) => formatMoney(r.total_sum) },
  ];

  return (
    <div>
      <PageHeader title="Приход" subtitle="Закупки на склад и текущие остатки" action={<Button onClick={openNew}>+ Добавить приход</Button>} />

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Остатки на складе</h2>
        <div className="grid grid-cols-4 gap-3">
          {(balance.data ?? []).length === 0 && !balance.isLoading && (
            <p className="col-span-4 text-sm text-slate-400">Склад пуст</p>
          )}
          {(balance.data ?? []).map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">
                {b.cement_mark_name} · {b.type}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(b.tonnage, 2)} т</div>
              <div className="text-xs text-slate-400">сред. себест. {formatMoney(b.avg_cost_per_ton)}/т</div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-800">История приходов</h2>
      <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} q={q} onQChange={setQ} qPlaceholder="Номер машины…">
        <Select value={zavodFilter} onChange={(e) => setZavodFilter(e.target.value)} className="!w-48">
          <option value="">Все заводы</option>
          {(zavody.data ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </FilterBar>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новый приход' : 'Изменить приход'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Завод" error={formState.errors.zavod_id?.message}>
              <Select {...register('zavod_id', { required: 'Выберите завод' })}>
                <option value="">—</option>
                {(zavody.data ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </FormRow>
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
            <FormRow label="Номер машины" error={formState.errors.machine_number?.message}>
              <Input {...register('machine_number', { required: 'Укажите номер машины' })} />
            </FormRow>
            <Checkbox label="Своя машина" {...register('machine_own')} />
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
        <ConfirmDialog
          title="Удалить приход?"
          message="Остатки склада и связанные продажи будут пересчитаны."
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
