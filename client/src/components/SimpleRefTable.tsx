import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { SidePanel } from '@/components/SidePanel';
import { FormRow, Input } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/toast';

interface Entity {
  id: number;
  created_at: string;
}

interface SimpleRefTableProps<T extends Entity, TInput extends Record<string, unknown>> {
  title: string;
  addLabel: string;
  fieldLabel: string;
  fieldName: keyof TInput & string;
  rows: T[] | undefined;
  loading: boolean;
  useCreate: () => UseMutationResult<T, unknown, TInput>;
  useUpdate: () => UseMutationResult<T, unknown, { id: number; data: TInput }>;
  useDelete: () => UseMutationResult<void, unknown, number>;
  displayValue: (row: T) => string;
  extraColumns?: Column<T>[];
}

export function SimpleRefTable<T extends Entity, TInput extends Record<string, unknown>>({
  title,
  addLabel,
  fieldLabel,
  fieldName,
  rows,
  loading,
  useCreate,
  useUpdate,
  useDelete,
  displayValue,
  extraColumns = [],
}: SimpleRefTableProps<T, TInput>) {
  const { notify } = useToast();
  const create = useCreate();
  const update = useUpdate();
  const del = useDelete();
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<Record<string, unknown>>({ defaultValues: {} });

  function openNew() {
    reset({ [fieldName]: '' });
    setEditing('new');
  }
  function openEdit(row: T) {
    reset({ [fieldName]: (row as unknown as Record<string, unknown>)[fieldName] });
    setEditing(row);
  }

  async function onSubmit(data: Record<string, unknown>) {
    try {
      if (editing === 'new') {
        await create.mutateAsync(data as TInput);
        notify('Добавлено');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: data as TInput });
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

  const columns: Column<T>[] = [
    { key: fieldName, header: fieldLabel, render: displayValue, sortValue: displayValue },
    ...extraColumns,
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button size="sm" onClick={openNew}>
          + {addLabel}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows ?? []}
        loading={loading}
        getRowId={(r) => r.id}
        onEdit={openEdit}
        onDelete={setDeleting}
      />

      {editing && (
        <SidePanel title={editing === 'new' ? addLabel : 'Изменить запись'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label={fieldLabel} error={formState.errors[fieldName]?.message as string | undefined}>
              <Input autoFocus {...register(fieldName, { required: 'Обязательное поле' })} />
            </FormRow>
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
          title="Удалить запись?"
          message={`Удалить «${displayValue(deleting)}»? Это действие нельзя отменить.`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
