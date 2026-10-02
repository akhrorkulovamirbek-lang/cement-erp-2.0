import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { bankAccountsHooks, cementMarksHooks, logisticsExpenseCategoriesHooks, machinesHooks } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { SimpleRefTable } from '@/components/SimpleRefTable';
import { FormRow, Input, RHFCheckbox } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { BankAccount, ExpenseCategory } from '@/types';
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
          <TabsTrigger value="bank-accounts">Банковские счета</TabsTrigger>
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

        <TabsContent value="bank-accounts" className="mt-4">
          <BankAccountsTab />
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

interface BankAccountForm {
  bank_name: string;
  account_number: string;
  display_name: string;
  initial_balance: string;
  currency: 'UZS' | 'USD';
  active: boolean;
}

const emptyBankAccountForm = (): BankAccountForm => ({
  bank_name: '',
  account_number: '',
  display_name: '',
  initial_balance: '0',
  currency: 'UZS',
  active: true,
});

/** Используется модулем «Обналичивание» — баланс счёта там же, ведётся транзакционно
 * (не редактируется напрямую, только через операции обналичивания). */
function BankAccountsTab() {
  const { notify } = useToast();
  const list = bankAccountsHooks.useList();
  const create = bankAccountsHooks.useCreate();
  const update = bankAccountsHooks.useUpdate();
  const del = bankAccountsHooks.useDelete();
  const [editing, setEditing] = useState<BankAccount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<BankAccountForm>({
    defaultValues: emptyBankAccountForm(),
  });

  function openNew() {
    reset(emptyBankAccountForm());
    setEditing('new');
  }
  function openEdit(row: BankAccount) {
    reset({
      bank_name: row.bank_name,
      account_number: row.account_number,
      display_name: row.display_name,
      initial_balance: row.initial_balance,
      currency: row.currency,
      active: row.active,
    });
    setEditing(row);
  }

  async function onSubmit(data: BankAccountForm) {
    const payload = { ...data, initial_balance: Number(data.initial_balance || 0) };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Счёт добавлен');
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

  const columns: Column<BankAccount>[] = [
    { key: 'display_name', header: 'Название', sortValue: (r) => r.display_name },
    { key: 'bank_name', header: 'Банк' },
    { key: 'account_number', header: 'Номер счёта' },
    {
      key: 'balance',
      header: 'Текущий баланс',
      align: 'right',
      sortValue: (r) => Number(r.balance),
      render: (r) => formatMoney(r.balance, r.currency),
    },
    { key: 'active', header: 'Статус', render: (r) => (r.active ? <Badge tone="green">Активен</Badge> : <Badge tone="slate">Выключен</Badge>) },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Банковские счета</h2>
        <Button size="sm" onClick={openNew}>
          + Добавить счёт
        </Button>
      </div>
      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новый счёт' : 'Изменить счёт'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Отображаемое название" error={formState.errors.display_name?.message}>
              <Input autoFocus {...register('display_name', { required: 'Укажите название' })} placeholder="Например, Асака банк — основной" />
            </FormRow>
            <FormRow label="Банк" error={formState.errors.bank_name?.message}>
              <Input {...register('bank_name', { required: 'Укажите банк' })} />
            </FormRow>
            <FormRow label="Номер счёта" error={formState.errors.account_number?.message}>
              <Input {...register('account_number', { required: 'Укажите номер счёта' })} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Начальный баланс">
                <Input type="number" step="0.01" {...register('initial_balance')} />
              </FormRow>
              <FormRow label="Валюта">
                <RHFButtonGroup
                  control={control}
                  name="currency"
                  options={[
                    { value: 'UZS', label: 'Сум' },
                    { value: 'USD', label: '$ USD' },
                  ]}
                  disabled={editing !== 'new'}
                />
              </FormRow>
            </div>
            {editing !== 'new' && <p className="text-xs text-muted-foreground">Валюту счёта нельзя изменить после создания — на нём уже могут быть операции.</p>}
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
          title="Удалить счёт?"
          message={`Удалить «${deleting.display_name}»? Это возможно только если по счёту не было операций обналичивания.`}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
