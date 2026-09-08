import { useState } from 'react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterBar } from '../components/FilterBar';
import { Button, FormRow, Input, Select } from '../components/form';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { formatDate, formatMoney, todayISO } from '../lib/format';
import { cashIncomeHooks, cashExpenseHooks, clientsHooks, zavodyHooks } from '../api/modules';
import type { CashExpense, CashIncome } from '../types';

const TABS = [
  { key: 'income', label: 'Приход' },
  { key: 'expense', label: 'Расход' },
] as const;

interface IncomeForm {
  date: string;
  category: 'цемент' | 'логистика' | 'возврат_биржи' | 'прочее';
  client_id: string;
  amount: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  payment_type: 'перечисление' | 'наличка' | 'карта';
  comment: string;
}

interface ExpenseForm {
  date: string;
  category: 'цемент' | 'логистика' | 'прочее';
  zavod_id: string;
  machine_number: string;
  expense_type: string;
  amount: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  payment_type: 'перечисление' | 'наличка' | 'карта';
  comment: string;
}

export function Cash() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('income');

  return (
    <div>
      <PageHeader title="Касса" subtitle="Приход и расход денег" />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'income' ? <IncomeTab /> : <ExpenseTab />}
    </div>
  );
}

function IncomeTab() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const list = cashIncomeHooks.useList({ from: from || undefined, to: to || undefined, client_id: clientFilter || undefined });
  const create = cashIncomeHooks.useCreate();
  const update = cashIncomeHooks.useUpdate();
  const del = cashIncomeHooks.useDelete();
  const clients = clientsHooks.useList();

  const [editing, setEditing] = useState<CashIncome | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CashIncome | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<IncomeForm>({
    defaultValues: { date: todayISO(), category: 'цемент', client_id: '', amount: '', currency: 'UZS', usd_rate: '', payment_type: 'перечисление', comment: '' },
  });
  const currency = watch('currency');

  function openNew() {
    reset({ date: todayISO(), category: 'цемент', client_id: '', amount: '', currency: 'UZS', usd_rate: '', payment_type: 'перечисление', comment: '' });
    setEditing('new');
  }
  function openEdit(row: CashIncome) {
    reset({
      date: row.date,
      category: row.category,
      client_id: row.client_id ? String(row.client_id) : '',
      amount: row.amount,
      currency: row.currency,
      usd_rate: row.usd_rate ?? '',
      payment_type: row.payment_type,
      comment: row.comment ?? '',
    });
    setEditing(row);
  }

  async function onSubmit(data: IncomeForm) {
    const payload = {
      date: data.date,
      category: data.category,
      client_id: data.client_id ? Number(data.client_id) : null,
      amount: Number(data.amount),
      currency: data.currency,
      usd_rate: data.currency === 'USD' ? Number(data.usd_rate) : null,
      payment_type: data.payment_type,
      comment: data.comment || null,
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

  const columns: Column<CashIncome>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'category', header: 'Категория' },
    { key: 'client_name', header: 'Клиент', render: (r) => r.client_name || '—' },
    { key: 'amount', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.amount), render: (r) => formatMoney(r.amount, r.currency) },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
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
        <Button onClick={openNew} className="shrink-0">
          + Новый приход
        </Button>
      </div>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новый приход' : 'Изменить приход'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Категория">
              <Select {...register('category', { required: true })}>
                <option value="цемент">Цемент</option>
                <option value="логистика">Логистика</option>
                <option value="возврат_биржи">Возврат биржи</option>
                <option value="прочее">Прочее</option>
              </Select>
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
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Сумма" error={formState.errors.amount?.message}>
                <Input type="number" step="0.01" {...register('amount', { required: 'Укажите сумму' })} />
              </FormRow>
              <FormRow label="Валюта">
                <Select {...register('currency', { required: true })}>
                  <option value="UZS">UZS (сум)</option>
                  <option value="USD">USD</option>
                </Select>
              </FormRow>
            </div>
            {currency === 'USD' && (
              <FormRow label="Курс доллара" error={formState.errors.usd_rate?.message}>
                <Input type="number" step="0.01" {...register('usd_rate', { required: 'Укажите курс' })} />
              </FormRow>
            )}
            <FormRow label="Способ оплаты">
              <Select {...register('payment_type', { required: true })}>
                <option value="перечисление">Перечисление</option>
                <option value="наличка">Наличка</option>
                <option value="карта">Карта</option>
              </Select>
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Input {...register('comment')} />
            </FormRow>
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

      {deleting && <ConfirmDialog title="Удалить операцию?" message="Это действие нельзя отменить." onConfirm={onDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

function ExpenseTab() {
  const { notify } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [zavodFilter, setZavodFilter] = useState('');
  const list = cashExpenseHooks.useList({ from: from || undefined, to: to || undefined, zavod_id: zavodFilter || undefined });
  const create = cashExpenseHooks.useCreate();
  const update = cashExpenseHooks.useUpdate();
  const del = cashExpenseHooks.useDelete();
  const zavody = zavodyHooks.useList();

  const [editing, setEditing] = useState<CashExpense | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CashExpense | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<ExpenseForm>({
    defaultValues: {
      date: todayISO(),
      category: 'цемент',
      zavod_id: '',
      machine_number: '',
      expense_type: '',
      amount: '',
      currency: 'UZS',
      usd_rate: '',
      payment_type: 'перечисление',
      comment: '',
    },
  });
  const currency = watch('currency');
  const category = watch('category');

  function openNew() {
    reset({
      date: todayISO(),
      category: 'цемент',
      zavod_id: '',
      machine_number: '',
      expense_type: '',
      amount: '',
      currency: 'UZS',
      usd_rate: '',
      payment_type: 'перечисление',
      comment: '',
    });
    setEditing('new');
  }
  function openEdit(row: CashExpense) {
    reset({
      date: row.date,
      category: row.category,
      zavod_id: row.zavod_id ? String(row.zavod_id) : '',
      machine_number: row.machine_number ?? '',
      expense_type: row.expense_type,
      amount: row.amount,
      currency: row.currency,
      usd_rate: row.usd_rate ?? '',
      payment_type: row.payment_type,
      comment: row.comment ?? '',
    });
    setEditing(row);
  }

  async function onSubmit(data: ExpenseForm) {
    const payload = {
      date: data.date,
      category: data.category,
      zavod_id: data.category === 'цемент' && data.zavod_id ? Number(data.zavod_id) : null,
      machine_number: data.machine_number || null,
      expense_type: data.expense_type,
      amount: Number(data.amount),
      currency: data.currency,
      usd_rate: data.currency === 'USD' ? Number(data.usd_rate) : null,
      payment_type: data.payment_type,
      comment: data.comment || null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload as never);
        notify('Расход добавлен');
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

  const columns: Column<CashExpense>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'category', header: 'Категория' },
    { key: 'zavod_name', header: 'Завод', render: (r) => r.zavod_name || '—' },
    { key: 'expense_type', header: 'Тип расхода' },
    { key: 'amount', header: 'Сумма', align: 'right', sortValue: (r) => Number(r.amount), render: (r) => formatMoney(r.amount, r.currency) },
    { key: 'payment_type', header: 'Способ' },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
          <Select value={zavodFilter} onChange={(e) => setZavodFilter(e.target.value)} className="!w-48">
            <option value="">Все заводы</option>
            {(zavody.data ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </FilterBar>
        <Button onClick={openNew} className="shrink-0">
          + Новый расход
        </Button>
      </div>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новый расход' : 'Изменить расход'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Категория">
              <Select {...register('category', { required: true })}>
                <option value="цемент">Цемент (оплата заводу)</option>
                <option value="логистика">Логистика</option>
                <option value="прочее">Прочее</option>
              </Select>
            </FormRow>
            {category === 'цемент' && (
              <FormRow label="Завод">
                <Select {...register('zavod_id')}>
                  <option value="">—</option>
                  {(zavody.data ?? []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
            {category === 'логистика' && (
              <FormRow label="Номер машины">
                <Input {...register('machine_number')} />
              </FormRow>
            )}
            <FormRow label="Тип расхода" error={formState.errors.expense_type?.message}>
              <Input {...register('expense_type', { required: 'Укажите тип расхода' })} placeholder="газ / запчасть / зп / обед" />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Сумма" error={formState.errors.amount?.message}>
                <Input type="number" step="0.01" {...register('amount', { required: 'Укажите сумму' })} />
              </FormRow>
              <FormRow label="Валюта">
                <Select {...register('currency', { required: true })}>
                  <option value="UZS">UZS (сум)</option>
                  <option value="USD">USD</option>
                </Select>
              </FormRow>
            </div>
            {currency === 'USD' && (
              <FormRow label="Курс доллара" error={formState.errors.usd_rate?.message}>
                <Input type="number" step="0.01" {...register('usd_rate', { required: 'Укажите курс' })} />
              </FormRow>
            )}
            <FormRow label="Способ оплаты">
              <Select {...register('payment_type', { required: true })}>
                <option value="перечисление">Перечисление</option>
                <option value="наличка">Наличка</option>
                <option value="карта">Карта</option>
              </Select>
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Input {...register('comment')} />
            </FormRow>
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

      {deleting && <ConfirmDialog title="Удалить операцию?" message="Это действие нельзя отменить." onConfirm={onDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
