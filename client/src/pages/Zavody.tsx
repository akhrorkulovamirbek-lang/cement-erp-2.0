import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useZavodBalances, zavodyHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { BulkImport } from '@/components/BulkImport';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Zavod, ZavodBalance } from '@/types';

/** «Название; Регион; Телефон; Начальный долг» — регион, телефон и долг необязательны. */
function parseZavodLine(raw: string): { label: string; payload: Record<string, unknown> } | null {
  const parts = raw.split(';').map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;
  const region = parts[1] || null;
  const phone = parts[2] || null;
  const debtRaw = parts[3]?.replace(/\s/g, '').replace(',', '.');
  const initial_debt = debtRaw ? Number(debtRaw) : 0;
  if (debtRaw && Number.isNaN(initial_debt)) return null;
  const label = `${name}${region ? ', ' + region : ''}${initial_debt ? ', долг ' + formatMoney(initial_debt) : ''}`;
  return { label, payload: { name, region, phone, initial_debt, active: true } };
}

interface Row extends Zavod {
  purchased: string;
  paid: string;
  balance: string;
}

interface FormValues {
  name: string;
  region: string;
  phone: string;
  initial_debt: string;
  active: boolean;
}

const emptyForm = (): FormValues => ({ name: '', region: '', phone: '', initial_debt: '0', active: true });

export function Zavody() {
  const { notify } = useToast();
  const list = zavodyHooks.useList();
  const balances = useZavodBalances();
  const create = zavodyHooks.useCreate();
  const update = zavodyHooks.useUpdate();
  const del = zavodyHooks.useDelete();

  const [editing, setEditing] = useState<Zavod | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Zavod | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  const balanceMap = new Map<number, ZavodBalance>((balances.data ?? []).map((b) => [b.id, b]));
  const rows: Row[] = (list.data ?? []).map((z) => {
    const b = balanceMap.get(z.id);
    return { ...z, purchased: b?.purchased ?? '0', paid: b?.paid ?? '0', balance: b?.balance ?? '0' };
  });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Row) {
    reset({ name: row.name, region: row.region ?? '', phone: row.phone ?? '', initial_debt: row.initial_debt, active: row.active });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const payload = {
      name: data.name,
      region: data.region || null,
      phone: data.phone || null,
      initial_debt: Number(data.initial_debt || 0),
      active: data.active,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Завод добавлен');
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
      header: 'Завод',
      sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/zavody/${r.id}`} className="font-medium text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'region', header: 'Регион', render: (r) => r.region || '—' },
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
      header: 'Мы должны',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n <= 0) return <Badge tone="green">Долга нет</Badge>;
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
        title="Заводы"
        subtitle="Кредиторка считается по прямым приходам (без тикетов — те оплачены сразу с биржи)"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              Добавить списком
            </Button>
            <Button onClick={openNew}>+ Добавить завод</Button>
          </div>
        }
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
        <SidePanel title={editing === 'new' ? 'Новый завод' : 'Изменить завод'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Название" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите название' })} />
            </FormRow>
            <FormRow label="Регион (необязательно)">
              <Input {...register('region')} />
            </FormRow>
            <FormRow label="Телефон (необязательно)">
              <Input {...register('phone')} placeholder="+998 90 123 45 67" />
            </FormRow>
            <FormRow label="Начальный долг">
              <Input type="number" step="0.01" {...register('initial_debt')} />
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
          title="Удалить завод?"
          message="Удалить? Это возможно только если завод нигде не используется. Чтобы скрыть завод из списков, но сохранить историю — снимите галочку «Активен»."
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {bulkOpen && (
        <BulkImport
          title="Добавить заводы списком"
          hint="По одной записи на строку: Название; Регион; Телефон; Начальный долг (регион, телефон и долг необязательны)."
          placeholder={'Кызылкумцемент; Навои; +998901234567; 10000000\nБекабадцемент'}
          parseLine={parseZavodLine}
          useCreate={zavodyHooks.useCreate}
          onClose={() => setBulkOpen(false)}
          onDone={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
