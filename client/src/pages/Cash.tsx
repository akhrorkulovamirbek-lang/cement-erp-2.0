import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import {
  cashExpenseHooks,
  cashIncomeHooks,
  clientsHooks,
  useCarrierBalances,
  useCashBalances,
  zavodyHooks,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { ButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { MoneyCell } from '@/components/MoneyCell';
import { MoneyFields } from '@/components/MoneyFields';
import { PageHeader } from '@/components/PageHeader';
import { QuickAddClient } from '@/components/QuickAddClient';
import { SidePanel } from '@/components/SidePanel';
import { StatCard } from '@/components/StatCard';
import { FormRow, Input, RHFSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney, todayISO } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { CashExpense, CashIncome, Client } from '@/types';

type CashRow = (CashIncome & { kind: 'income' }) | (CashExpense & { kind: 'expense' });

interface CashForm {
  date: string;
  category: string;
  client_id: string;
  zavod_id: string;
  machine_number: string;
  carrier_name: string;
  expense_type: string;
  amount: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  payment_type: 'перечисление' | 'наличка' | 'карта';
  comment: string;
  payer_name: string;
  extra_amount: string;
}

const INCOME_CATEGORY_OPTIONS = [
  { value: 'цемент', label: 'Оплата за цемент' },
  { value: 'логистика', label: 'Оплата за логистику' },
  { value: 'возврат_биржи', label: 'Возврат с биржи' },
  { value: 'прочее', label: 'Прочее' },
];
const EXPENSE_CATEGORY_OPTIONS = [
  { value: 'цемент', label: 'Оплата заводу' },
  { value: 'логистика', label: 'Логистика' },
  { value: 'перевозчик', label: 'Оплата перевозчику' },
  { value: 'прочее', label: 'Прочее' },
];
const KIND_OPTIONS = [
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Расход' },
];
const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Расход' },
];

const emptyIncomeForm = (): CashForm => ({
  date: todayISO(),
  category: 'цемент',
  client_id: '',
  zavod_id: '',
  machine_number: '',
  carrier_name: '',
  expense_type: '',
  amount: '',
  currency: 'UZS',
  usd_rate: '',
  payment_type: 'перечисление',
  comment: '',
  payer_name: '',
  extra_amount: '',
});
const emptyExpenseForm = (): CashForm => ({ ...emptyIncomeForm(), category: 'цемент' });

/** Раздел 4 ТЗ: Касса одним списком (приход+расход), а не двумя отдельными таблицами —
 * пользователь просил не заходить на разные вкладки ради одного журнала операций. */
export function Cash() {
  const { notify } = useToast();
  const cashBalances = useCashBalances();
  const carrierBalances = useCarrierBalances();
  const clients = clientsHooks.useList();
  const zavody = zavodyHooks.useList();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const incomeList = cashIncomeHooks.useList({ from: from || undefined, to: to || undefined });
  const expenseList = cashExpenseHooks.useList({ from: from || undefined, to: to || undefined });
  const incomeCreate = cashIncomeHooks.useCreate();
  const incomeUpdate = cashIncomeHooks.useUpdate();
  const incomeDelete = cashIncomeHooks.useDelete();
  const expenseCreate = cashExpenseHooks.useCreate();
  const expenseUpdate = cashExpenseHooks.useUpdate();
  const expenseDelete = cashExpenseHooks.useDelete();

  const [editing, setEditing] = useState<CashRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CashRow | null>(null);
  const [formKind, setFormKind] = useState<'income' | 'expense'>('income');
  const [justAddedClient, setJustAddedClient] = useState<Client | null>(null);
  const [showSplit, setShowSplit] = useState(false);

  const { register, control, handleSubmit, reset, setValue, watch, formState } = useForm<CashForm>({
    defaultValues: emptyIncomeForm(),
  });
  const category = watch('category');
  const carrierNameWatch = watch('carrier_name');
  const currencyWatch = watch('currency');
  const splitCurrency = currencyWatch === 'USD' ? 'UZS' : 'USD';

  const rows: CashRow[] = useMemo(() => {
    const inc: CashRow[] = (incomeList.data ?? []).map((r) => ({ ...r, kind: 'income' as const }));
    const exp: CashRow[] = (expenseList.data ?? []).map((r) => ({ ...r, kind: 'expense' as const }));
    const merged = [...inc, ...exp].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    if (!typeFilter) return merged;
    return merged.filter((r) => r.kind === typeFilter);
  }, [incomeList.data, expenseList.data, typeFilter]);

  const clientOptions = (
    justAddedClient && !(clients.data ?? []).some((c) => c.id === justAddedClient.id)
      ? [justAddedClient, ...(clients.data ?? [])]
      : (clients.data ?? [])
  ).map((c) => ({ value: String(c.id), label: c.name }));

  function selectClient(client: Client) {
    setJustAddedClient(client);
    setValue('client_id', String(client.id), { shouldValidate: true });
    setTimeout(() => setValue('client_id', String(client.id), { shouldValidate: true }), 250);
  }

  function switchKind(kind: string) {
    setFormKind(kind as 'income' | 'expense');
    setShowSplit(false);
    reset(kind === 'income' ? emptyIncomeForm() : emptyExpenseForm());
  }

  function openNew() {
    setFormKind('income');
    setShowSplit(false);
    reset(emptyIncomeForm());
    setEditing('new');
  }

  function openEdit(row: CashRow) {
    setFormKind(row.kind);
    if (row.kind === 'income') {
      setShowSplit(Boolean(row.extra_amount));
      reset({
        ...emptyIncomeForm(),
        date: row.date,
        category: row.category,
        client_id: row.client_id ? String(row.client_id) : '',
        amount: row.amount,
        currency: row.currency,
        usd_rate: row.usd_rate ?? '',
        payment_type: row.payment_type,
        comment: row.comment ?? '',
        payer_name: row.payer_name ?? '',
        extra_amount: row.extra_amount ?? '',
      });
    } else {
      setShowSplit(false);
      reset({
        ...emptyExpenseForm(),
        date: row.date,
        category: row.category,
        zavod_id: row.zavod_id ? String(row.zavod_id) : '',
        machine_number: row.machine_number ?? '',
        carrier_name: row.carrier_name ?? '',
        expense_type: row.expense_type ?? '',
        amount: row.amount,
        currency: row.currency,
        usd_rate: row.usd_rate ?? '',
        payment_type: row.payment_type,
        comment: row.comment ?? '',
      });
    }
    setEditing(row);
  }

  async function onSubmit(data: CashForm) {
    try {
      if (formKind === 'income') {
        const payload = {
          date: data.date,
          category: data.category,
          client_id: data.client_id ? Number(data.client_id) : null,
          amount: Number(data.amount),
          currency: data.currency,
          usd_rate: data.currency === 'USD' || showSplit ? Number(data.usd_rate) : null,
          payment_type: data.payment_type,
          comment: data.comment || null,
          payer_name: data.payer_name || null,
          extra_amount: showSplit && data.extra_amount ? Number(data.extra_amount) : null,
        };
        if (editing === 'new') {
          await incomeCreate.mutateAsync(payload as never);
          notify('Приход добавлен');
        } else if (editing) {
          await incomeUpdate.mutateAsync({ id: editing.id, data: payload as never });
          notify('Сохранено');
        }
      } else {
        const payload = {
          date: data.date,
          category: data.category,
          zavod_id: data.category === 'цемент' && data.zavod_id ? Number(data.zavod_id) : null,
          machine_number: data.category === 'логистика' && data.machine_number ? data.machine_number : null,
          carrier_name: data.category === 'перевозчик' ? data.carrier_name : null,
          expense_type: data.category === 'перевозчик' ? null : data.expense_type,
          amount: Number(data.amount),
          currency: data.currency,
          usd_rate: data.currency === 'USD' ? Number(data.usd_rate) : null,
          payment_type: data.payment_type,
          comment: data.comment || null,
        };
        if (editing === 'new') {
          await expenseCreate.mutateAsync(payload as never);
          notify('Расход добавлен');
        } else if (editing) {
          await expenseUpdate.mutateAsync({ id: editing.id, data: payload as never });
          notify('Сохранено');
        }
      }
      setEditing(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      if (deleting.kind === 'income') await incomeDelete.mutateAsync(deleting.id);
      else await expenseDelete.mutateAsync(deleting.id);
      notify('Удалено');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setDeleting(null);
    }
  }

  const matchedCarrier = carrierBalances.data?.find(
    (c) => c.name.trim().toLowerCase() === (carrierNameWatch ?? '').trim().toLowerCase(),
  );
  const carrierDebt = matchedCarrier ? Number(matchedCarrier.balance) : 0;

  const columns: Column<CashRow>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'kind',
      header: 'Тип',
      render: (r) => (r.kind === 'income' ? <Badge tone="green">Приход</Badge> : <Badge tone="red">Расход</Badge>),
    },
    { key: 'category', header: 'Категория' },
    {
      key: 'counterparty',
      header: 'Контрагент',
      render: (r) => {
        if (r.kind === 'income') {
          const name = r.client_name || '—';
          return r.payer_name ? `${name} (${r.payer_name})` : name;
        }
        return r.zavod_name || r.carrier_name || r.machine_number || '—';
      },
    },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <div className={r.kind === 'income' ? 'font-medium text-emerald-600' : 'font-medium text-destructive'}>
          <MoneyCell
            amount={r.amount}
            currency={r.currency}
            usdRate={r.usd_rate}
            extraAmount={r.kind === 'income' ? r.extra_amount : null}
          />
        </div>
      ),
    },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <PageHeader title="Касса" subtitle="Приход и расход денег — единым списком" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Наличные" value={formatMoney(cashBalances.data?.наличка ?? 0)} />
        <StatCard label="Карта" value={formatMoney(cashBalances.data?.карта ?? 0)} />
        <StatCard label="Перевод" value={formatMoney(cashBalances.data?.перечисление ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
          <ButtonGroup value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} />
        </FilterBar>
        <Button className="shrink-0" onClick={openNew}>
          + Новая операция
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={incomeList.isLoading || expenseList.isLoading}
        getRowId={(r) => `${r.kind}-${r.id}`}
        onEdit={openEdit}
        onDelete={setDeleting}
      />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новая операция' : 'Изменить операцию'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Тип операции">
              <ButtonGroup value={formKind} onChange={switchKind} options={KIND_OPTIONS} disabled={editing !== 'new'} />
            </FormRow>
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Категория">
              <RHFSelect
                control={control}
                name="category"
                options={formKind === 'income' ? INCOME_CATEGORY_OPTIONS : EXPENSE_CATEGORY_OPTIONS}
              />
            </FormRow>

            {formKind === 'income' && (
              <div className="space-y-1.5">
                <FormRow label={category === 'цемент' ? 'Клиент' : 'Клиент (необязательно)'} error={formState.errors.client_id?.message}>
                  <RHFSelect control={control} name="client_id" options={clientOptions} />
                </FormRow>
                <QuickAddClient onCreated={selectClient} />
              </div>
            )}

            {formKind === 'income' && (
              <FormRow label="Плательщик (необязательно, если платит не сам клиент)">
                <Input {...register('payer_name')} placeholder="Например, другая фирма" />
              </FormRow>
            )}

            {formKind === 'expense' && category === 'цемент' && (
              <FormRow label="Завод">
                <RHFSelect
                  control={control}
                  name="zavod_id"
                  options={(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))}
                />
              </FormRow>
            )}
            {formKind === 'expense' && category === 'логистика' && (
              <FormRow label="Номер машины (необязательно)">
                <Input {...register('machine_number')} />
              </FormRow>
            )}
            {formKind === 'expense' && category === 'перевозчик' && (
              <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                <Input
                  {...register('carrier_name', { required: 'Укажите перевозчика' })}
                  placeholder="Имя или номер машины"
                  list="carrier-names"
                />
                <datalist id="carrier-names">
                  {(carrierBalances.data ?? []).map((c) => (
                    <option key={c.name} value={c.name} />
                  ))}
                </datalist>
                {matchedCarrier && carrierDebt !== 0 && (
                  <p className="mt-1.5 flex items-center justify-between text-xs">
                    <span className={carrierDebt > 0 ? 'text-destructive' : 'text-emerald-600'}>
                      {carrierDebt > 0 ? `Мы должны: ${formatMoney(carrierDebt)}` : `Переплата: ${formatMoney(-carrierDebt)}`}
                    </span>
                    {carrierDebt > 0 && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setValue('amount', String(carrierDebt))}
                      >
                        Подставить сумму
                      </Button>
                    )}
                  </p>
                )}
              </FormRow>
            )}
            {formKind === 'expense' && category !== 'перевозчик' && (
              <FormRow label="Тип расхода" error={formState.errors.expense_type?.message}>
                <Input
                  {...register('expense_type', { required: 'Укажите тип расхода' })}
                  placeholder="газ / запчасть / зп / обед"
                />
              </FormRow>
            )}

            <MoneyFields control={control} register={register} watch={watch} errors={formState.errors} forceShowRate={formKind === 'income' && showSplit} />

            {formKind === 'income' && (
              <div>
                {!showSplit ? (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowSplit(true)}>
                    + Клиент доплатил в {splitCurrency === 'USD' ? 'долларах' : 'сумах'}
                  </Button>
                ) : (
                  <FormRow
                    label={`Сумма в ${splitCurrency === 'USD' ? '$' : 'сумах'} (вторая часть платежа)`}
                    error={formState.errors.extra_amount?.message}
                  >
                    <div className="flex items-center gap-2">
                      <Input type="number" step="0.01" {...register('extra_amount')} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowSplit(false);
                          setValue('extra_amount', '');
                        }}
                      >
                        Убрать
                      </Button>
                    </div>
                  </FormRow>
                )}
              </div>
            )}

            <FormRow label="Комментарий (необязательно)">
              <Input {...register('comment')} />
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
          title="Удалить операцию?"
          message="Это действие нельзя отменить."
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
