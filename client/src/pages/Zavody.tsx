import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, FormRow, Input } from '../components/form';
import { Badge } from '../components/Badge';
import { zavodyHooks, useZavodBalances } from '../api/modules';
import { formatMoney } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import type { Zavod, ZavodBalance } from '../types';

interface Row extends Zavod {
  purchased: string;
  paid: string;
  balance: string;
}

export function Zavody() {
  const { notify } = useToast();
  const list = zavodyHooks.useList();
  const balances = useZavodBalances();
  const create = zavodyHooks.useCreate();
  const update = zavodyHooks.useUpdate();
  const del = zavodyHooks.useDelete();

  const [editing, setEditing] = useState<Zavod | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Zavod | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<{ name: string }>();

  const balanceMap = new Map<number, ZavodBalance>((balances.data ?? []).map((b) => [b.id, b]));
  const rows: Row[] = (list.data ?? []).map((z) => {
    const b = balanceMap.get(z.id);
    return { ...z, purchased: b?.purchased ?? '0', paid: b?.paid ?? '0', balance: b?.balance ?? '0' };
  });

  function openNew() {
    reset({ name: '' });
    setEditing('new');
  }
  function openEdit(row: Row) {
    reset({ name: row.name });
    setEditing(row);
  }

  async function onSubmit(data: { name: string }) {
    try {
      if (editing === 'new') {
        await create.mutateAsync(data);
        notify('Завод добавлен');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data });
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
      header: 'Завод',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/zavody/${r.id}`} className="font-medium text-brand-700 hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'purchased', header: 'Куплено', align: 'right', sortValue: (r) => Number(r.purchased), render: (r) => formatMoney(r.purchased) },
    { key: 'paid', header: 'Оплачено', align: 'right', sortValue: (r) => Number(r.paid), render: (r) => formatMoney(r.paid) },
    {
      key: 'balance',
      header: 'Мы должны',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Долга нет</Badge>;
        return <span className="font-semibold text-red-600">{formatMoney(n)}</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Заводы"
        subtitle="Кредиторка считается по прямым приходам (без тикетов — те оплачены сразу с биржи)"
        action={<Button onClick={openNew}>+ Добавить завод</Button>}
      />

      <DataTable columns={columns} rows={rows} loading={list.isLoading || balances.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <Modal title={editing === 'new' ? 'Новый завод' : 'Изменить завод'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Название" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите название' })} />
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
          title="Удалить завод?"
          message={`Удалить «${deleting.name}»? Это возможно только если завод нигде не используется.`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
