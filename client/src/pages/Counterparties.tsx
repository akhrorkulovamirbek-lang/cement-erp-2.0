import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { cementMarksHooks, logisticsExpenseCategoriesHooks, machinesHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { SimpleRefTable } from '@/components/SimpleRefTable';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/lib/toast';
import type { ExpenseCategory } from '@/types';
import { Clients } from './Clients';
import { Zavody } from './Zavody';

/** Раздел 10 ТЗ: боковое меню — «Контрагенты» одним пунктом, а не Клиенты/Заводы/Справочники
 * отдельно. Клиенты/Заводы переиспользуются как есть — у них своя логика (долги, детальные
 * страницы /clients/:id, /zavody/:id), просто монтируются вкладками. */
export function Counterparties() {
  const marks = cementMarksHooks.useList();
  const machines = machinesHooks.useList();

  return (
    <div>
      <PageHeader title="Контрагенты" subtitle="Клиенты, заводы и общие справочники" />

      <Tabs defaultValue="clients">
        <TabsList className="flex-wrap">
          <TabsTrigger value="clients">Клиенты</TabsTrigger>
          <TabsTrigger value="zavody">Заводы</TabsTrigger>
          <TabsTrigger value="marks">Марки цемента</TabsTrigger>
          <TabsTrigger value="machines">Свои машины</TabsTrigger>
          <TabsTrigger value="logistics-expenses">Категории расходов логистики</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          <Clients />
        </TabsContent>

        <TabsContent value="zavody" className="mt-4">
          <Zavody />
        </TabsContent>

        <TabsContent value="marks" className="mt-4">
          <SimpleRefTable
            title="Марки цемента"
            addLabel="Добавить марку"
            fieldLabel="Название"
            fieldName="name"
            rows={marks.data}
            loading={marks.isLoading}
            useCreate={cementMarksHooks.useCreate}
            useUpdate={cementMarksHooks.useUpdate}
            useDelete={cementMarksHooks.useDelete}
            displayValue={(r) => r.name}
          />
        </TabsContent>

        <TabsContent value="machines" className="mt-4">
          <SimpleRefTable
            title="Свои машины"
            addLabel="Добавить машину"
            fieldLabel="Госномер"
            fieldName="number"
            rows={machines.data}
            loading={machines.isLoading}
            useCreate={machinesHooks.useCreate}
            useUpdate={machinesHooks.useUpdate}
            useDelete={machinesHooks.useDelete}
            displayValue={(r) => r.number}
          />
        </TabsContent>

        <TabsContent value="logistics-expenses" className="mt-4">
          <LogisticsExpenseCategoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ExpenseCategoryForm {
  name: string;
  active: boolean;
}

function LogisticsExpenseCategoriesTab() {
  const { notify } = useToast();
  const list = logisticsExpenseCategoriesHooks.useList();
  const create = logisticsExpenseCategoriesHooks.useCreate();
  const update = logisticsExpenseCategoriesHooks.useUpdate();
  const [editing, setEditing] = useState<ExpenseCategory | 'new' | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<ExpenseCategoryForm>();

  function openNew() {
    reset({ name: '', active: true });
    setEditing('new');
  }
  function openEdit(row: ExpenseCategory) {
    reset({ name: row.name, active: row.active });
    setEditing(row);
  }

  async function onSubmit(data: ExpenseCategoryForm) {
    try {
      if (editing === 'new') {
        await create.mutateAsync({ ...data });
        notify('Категория добавлена');
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, data: { ...data } });
        notify('Сохранено');
      }
      setEditing(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  const columns: Column<ExpenseCategory>[] = [
    { key: 'name', header: 'Название', sortValue: (r) => r.name },
    { key: 'active', header: 'Статус', render: (r) => (r.active ? <Badge tone="green">Активна</Badge> : <Badge tone="slate">Выключена</Badge>) },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Категории расходов логистики</h2>
        <Button size="sm" onClick={openNew}>
          + Добавить категорию
        </Button>
      </div>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новая категория' : 'Изменить категорию'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Название" error={formState.errors.name?.message}>
              <Input autoFocus {...register('name', { required: 'Укажите название' })} />
            </FormRow>
            <RHFCheckbox control={control} name="active" label="Активна" />
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
    </div>
  );
}
