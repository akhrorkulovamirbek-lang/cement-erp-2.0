import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { clientsHooks, useClientBalances } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Client, ClientBalance } from '@/types';

interface Row extends Client {
  purchased: string;
  paid: string;
  balance: string;
}

interface FormValues {
  name: string;
  phone: string;
  contact_person: string;
  inn: string;
  initial_debt: string;
  comment: string;
  active: boolean;
}

const emptyForm = (): FormValues => ({ name: '', phone: '', contact_person: '', inn: '', initial_debt: '0', comment: '', active: true });

export function Clients() {
  const { notify } = useToast();
  const list = clientsHooks.useList();
  const balances = useClientBalances();
  const create = clientsHooks.useCreate();
  const update = clientsHooks.useUpdate();
  const del = clientsHooks.useDelete();

  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  const balanceMap = new Map<number, ClientBalance>((balances.data ?? []).map((b) => [b.id, b]));
  const rows: Row[] = (list.data ?? []).map((c) => {
    const b = balanceMap.get(c.id);
    return { ...c, purchased: b?.purchased ?? '0', paid: b?.paid ?? '0', balance: b?.balance ?? '0' };
  });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Row) {
    reset({
      name: row.name,
      phone: row.phone ?? '',
      contact_person: row.contact_person ?? '',
      inn: row.inn ?? '',
      initial_debt: row.initial_debt,
      comment: row.comment ?? '',
      active: row.active,
    });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const payload = {
      name: data.name,
      phone: data.phone || null,
      contact_person: data.contact_person || null,
      inn: data.inn || null,
      initial_debt: Number(data.initial_debt || 0),
      comment: data.comment || null,
      active: data.active,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Клиент добавлен');
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

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Клиент',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/clients/${r.id}`} className="font-medium text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'phone', header: 'Телефон', render: (r) => r.phone || '—' },
    {
      key: 'purchased',
      header: 'Куплено',
      align: 'right',
      sortValue: (r) => Number(r.purchased),
      render: (r) => formatMoney(r.purchased),
    },
    {
      key: 'paid',
      header: 'Оплачено',
      align: 'right',
      sortValue: (r) => Number(r.paid),
      render: (r) => formatMoney(r.paid),
    },
    {
      key: 'balance',
      header: 'Долг',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Без долга</Badge>;
        return <span className="font-semibold text-destructive">{formatMoney(n)}</span>;
      },
    },
    {
      key: 'active',
      header: 'Статус',
      render: (r) => (r.active ? <Badge tone="green">Активен</Badge> : <Badge tone="slate">Выключен</Badge>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Клиенты"
        subtitle="Долги считаются автоматически: куплено минус оплачено"
        action={<Button onClick={openNew}>+ Добавить клиента</Button>}
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading || balances.isLoading}
        getRowId={(r) => r.id}
        onEdit={openEdit}
        onDelete={setDeleting}
      />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новый клиент' : 'Изменить клиента'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Имя" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите имя' })} />
            </FormRow>
            <FormRow label="Телефон (необязательно)">
              <Input {...register('phone')} placeholder="+998 90 123 45 67" />
            </FormRow>
            <FormRow label="Контактное лицо (необязательно)">
              <Input {...register('contact_person')} />
            </FormRow>
            <FormRow label="ИНН (необязательно)">
              <Input {...register('inn')} />
            </FormRow>
            <FormRow label="Начальный долг">
              <Input type="number" step="0.01" {...register('initial_debt')} />
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Textarea {...register('comment')} rows={2} />
            </FormRow>
            <RHFCheckbox control={control} name="active" label="Активен" />
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
        <ConfirmDialog
          title="Удалить клиента?"
          message={`Удалить «${deleting.name}»? Это возможно только если у клиента нет продаж и платежей. Чтобы скрыть клиента из списков, но сохранить историю — снимите галочку «Активен».`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
