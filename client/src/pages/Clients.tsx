import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, FormRow, Input } from '../components/form';
import { Badge } from '../components/Badge';
import { clientsHooks, useClientBalances } from '../api/modules';
import { formatMoney } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import type { Client, ClientBalance } from '../types';

interface Row extends Client {
  purchased: string;
  paid: string;
  balance: string;
}

interface FormValues {
  name: string;
  phone: string;
}

export function Clients() {
  const { notify } = useToast();
  const list = clientsHooks.useList();
  const balances = useClientBalances();
  const create = clientsHooks.useCreate();
  const update = clientsHooks.useUpdate();
  const del = clientsHooks.useDelete();

  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>();

  const balanceMap = new Map<number, ClientBalance>((balances.data ?? []).map((b) => [b.id, b]));
  const rows: Row[] = (list.data ?? []).map((c) => {
    const b = balanceMap.get(c.id);
    return { ...c, purchased: b?.purchased ?? '0', paid: b?.paid ?? '0', balance: b?.balance ?? '0' };
  });

  function openNew() {
    reset({ name: '', phone: '' });
    setEditing('new');
  }
  function openEdit(row: Row) {
    reset({ name: row.name, phone: row.phone ?? '' });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    try {
      if (editing === 'new') {
        await create.mutateAsync({ name: data.name, phone: data.phone || null });
        notify('Клиент добавлен');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: { name: data.name, phone: data.phone || null } });
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

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Клиент',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/clients/${r.id}`} className="font-medium text-brand-700 hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'phone', header: 'Телефон', render: (r) => r.phone || '—' },
    { key: 'purchased', header: 'Куплено', align: 'right', sortValue: (r) => Number(r.purchased), render: (r) => formatMoney(r.purchased) },
    { key: 'paid', header: 'Оплачено', align: 'right', sortValue: (r) => Number(r.paid), render: (r) => formatMoney(r.paid) },
    {
      key: 'balance',
      header: 'Долг',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Без долга</Badge>;
        return <span className="font-semibold text-red-600">{formatMoney(n)}</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Клиенты"
        subtitle="Долги считаются автоматически: куплено минус оплачено"
        action={<Button onClick={openNew}>+ Добавить клиента</Button>}
      />

      <DataTable columns={columns} rows={rows} loading={list.isLoading || balances.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новый клиент' : 'Изменить клиента'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Имя" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите имя' })} />
            </FormRow>
            <FormRow label="Телефон (необязательно)">
              <Input {...register('phone')} placeholder="+998 90 123 45 67" />
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

      {deleting && (
        <ConfirmDialog
          title="Удалить клиента?"
          message={`Удалить «${deleting.name}»? Это возможно только если у клиента нет продаж и платежей.`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
