import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { logistsHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Logist } from '@/types';

interface FormValues {
  name: string;
  phone: string;
  initial_debt: string;
  comment: string;
  active: boolean;
}

const emptyForm = (): FormValues => ({ name: '', phone: '', initial_debt: '0', comment: '', active: true });

/** Вкладка «Логисты» в Контрагентах: перевозчики с их машинами. Баланс считается из рейсов, выплат,
 * начального долга и корректировок (одинаково с отчётом «Перевозчики»). */
export function LogistsTab() {
  const { notify } = useToast();
  const list = logistsHooks.useList();
  const create = logistsHooks.useCreate();
  const update = logistsHooks.useUpdate();
  const del = logistsHooks.useDelete();
  const [editing, setEditing] = useState<Logist | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Logist | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: emptyForm() });

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: Logist) {
    reset({ name: row.name, phone: row.phone ?? '', initial_debt: row.initial_debt, comment: row.comment ?? '', active: row.active });
    setEditing(row);
  }

  async function onSubmit(data: FormValues) {
    const payload = {
      name: data.name,
      phone: data.phone || null,
      initial_debt: Number(data.initial_debt || 0),
      comment: data.comment || null,
      active: data.active,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Логист добавлен');
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

  const columns: Column<Logist>[] = [
    {
      key: 'name',
      header: 'Логист',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Link to={`/logists/${r.id}`} className="font-medium text-primary hover:underline">
            {r.name}
          </Link>
          {!r.active && <Badge tone="slate">Отключён</Badge>}
        </span>
      ),
    },
    { key: 'phone', header: 'Телефон', render: (r) => r.phone || '—' },
    { key: 'machines', header: 'Машины', render: (r) => (r.machines.length ? r.machines.join(', ') : '—') },
    {
      key: 'balance',
      header: 'Баланс',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => {
        const n = Number(r.balance);
        if (n === 0) return <Badge tone="green">Рассчитались</Badge>;
        if (n < 0) return <span className="font-semibold text-emerald-600">Должен нам {formatMoney(-n)}</span>;
        return <span className="font-semibold text-destructive">Мы должны {formatMoney(n)}</span>;
      },
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Логисты (перевозчики) и их машины</h2>
        <Button size="sm" onClick={openNew}>
          + Добавить логиста
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        getRowId={(r) => r.id}
        onEdit={openEdit}
        onDelete={setDeleting}
        searchable
        emptyMessage="Логистов пока нет — добавьте первого"
      />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новый логист' : 'Изменить логиста'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Имя или название" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите имя или название' })} />
            </FormRow>
            <FormRow label="Телефон (необязательно)">
              <Input {...register('phone')} placeholder="+998 90 123 45 67" />
            </FormRow>
            <FormRow label="Начальный долг (сколько мы ему должны; если он должен нам — со знаком минус)">
              <Input type="number" step="0.01" {...register('initial_debt')} />
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Textarea {...register('comment')} rows={2} />
            </FormRow>
            <RHFCheckbox control={control} name="active" label="Активен" />
            <p className="text-xs text-muted-foreground">
              Машины логиста добавляются на его карточке. Если переименовать логиста, имя обновится и в его старых рейсах и выплатах.
            </p>
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
          title="Удалить логиста?"
          message={`Удалить «${deleting.name}»? Это возможно, только если у него нет рейсов и выплат. Иначе снимите галочку «Активен».`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
