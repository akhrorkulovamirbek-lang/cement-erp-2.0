import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import {
  cashExpenseHooks,
  cashIncomeHooks,
  clientsHooks,
  logisticsExpenseCategoriesHooks,
  machinesHooks,
  useCarrierBalances,
  useCashBalances,
  useSuggestions,
  useTicketReturns,
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
import { SuggestInput } from '@/components/SuggestInput';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney, todayISO } from '@/lib/format';
import { normalizePlateNumber } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import type { CashExpense, CashIncome, Client, TicketReturnInfo } from '@/types';

type CashRow =
  | (CashIncome & { kind: 'income' })
  | (CashExpense & { kind: 'expense' })
  | (TicketReturnInfo & { kind: 'info' });

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
  { value: 'контрагент', label: 'Оплата поставщику (клиенту)' },
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
  const expenseCategories = logisticsExpenseCategoriesHooks.useList();
  const machines = machinesHooks.useList();
  const createMachine = machinesHooks.useCreate();
  const suggestions = useSuggestions();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const incomeList = cashIncomeHooks.useList({ from: from || undefined, to: to || undefined });
  const expenseList = cashExpenseHooks.useList({ from: from || undefined, to: to || undefined });
  const ticketReturns = useTicketReturns({ from: from || undefined, to: to || undefined });
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
  const machineNumberWatch = watch('machine_number');
  const currencyWatch = watch('currency');
  const splitCurrency = currencyWatch === 'USD' ? 'UZS' : 'USD';

  const rows: CashRow[] = useMemo(() => {
    const inc: CashRow[] = (incomeList.data ?? []).map((r) => ({ ...r, kind: 'income' as const }));
    const exp: CashRow[] = (expenseList.data ?? []).map((r) => ({ ...r, kind: 'expense' as const }));
    const info: CashRow[] = typeFilter ? [] : (ticketReturns.data ?? []).map((r) => ({ ...r, kind: 'info' as const }));
    const merged = [...inc, ...exp, ...info].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    if (!typeFilter) return merged;
    return merged.filter((r) => r.kind === typeFilter);
  }, [incomeList.data, expenseList.data, ticketReturns.data, typeFilter]);

  // Итоги за выбранный период (в сумах): считаются по тем же записям, что показаны в списке ниже.
  const periodTotals = useMemo(() => {
    const uzs = (amount: string, currency: string, rate: string | null) => (currency === 'USD' ? Number(amount) * Number(rate ?? 0) : Number(amount));
    const income = (incomeList.data ?? []).reduce((sum, r) => {
      const extraCurrency = r.currency === 'USD' ? 'UZS' : 'USD';
      return sum + uzs(r.amount, r.currency, r.usd_rate) + (r.extra_amount ? uzs(r.extra_amount, extraCurrency, r.usd_rate) : 0);
    }, 0);
    const expense = (expenseList.data ?? []).reduce((sum, r) => sum + uzs(r.amount, r.currency, r.usd_rate), 0);
    return { income, expense };
  }, [incomeList.data, expenseList.data]);

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

  function readOnlyReason(row: CashRow): string | null {
    if (row.kind === 'info') return 'Это информационная запись о возврате тикета на брокерский счёт — её нельзя менять отсюда';
    if (row.kind === 'expense' && row.related_broker_op_id) return 'Это пополнение брокерского счёта — оно ведётся в разделе «Приход» → брокерский счёт';
    if (row.kind === 'expense' && row.category === 'обналичивание') return 'Эта выдача связана с обналичиванием — меняйте её в разделе «Обналичивание»';
    return null;
  }

  function openEdit(row: CashRow) {
    const reason = readOnlyReason(row);
    if (reason) {
      notify(reason, 'error');
      return;
    }
    if (row.kind === 'info') return;
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
        client_id: row.client_id ? String(row.client_id) : '',
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
    setEditing(row as Exclude<CashRow, { kind: 'info' }>);
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
          client_id: data.category === 'контрагент' && data.client_id ? Number(data.client_id) : null,
          machine_number: data.category === 'логистика' && data.machine_number ? data.machine_number : null,
          carrier_name: data.category === 'перевозчик' ? data.carrier_name : null,
          expense_type: data.category === 'перевозчик' || data.category === 'контрагент' ? null : data.expense_type,
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
    if (!deleting || deleting.kind === 'info') return;
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

  const expenseTypeOptions = (expenseCategories.data ?? [])
    .filter((c) => c.active || c.name === watch('expense_type'))
    .map((c) => ({ value: c.name, label: c.name }));
  const normalizedMachine = normalizePlateNumber(machineNumberWatch ?? '');
  const machineMissing =
    formKind === 'expense' &&
    category === 'логистика' &&
    normalizedMachine.length > 0 &&
    machines.isSuccess &&
    !(machines.data ?? []).some((m) => m.number === normalizedMachine);

  async function addMachineToBase() {
    try {
      await createMachine.mutateAsync({ number: normalizedMachine });
      notify(`Машина ${normalizedMachine} добавлена в базу`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  const columns: Column<CashRow>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'kind',
      header: 'Тип',
      render: (r) => {
        if (r.kind === 'info') return <Badge tone="blue">Информация</Badge>;
        return r.kind === 'income' ? <Badge tone="green">Приход</Badge> : <Badge tone="red">Расход</Badge>;
      },
    },
    {
      key: 'category',
      header: 'Категория',
      render: (r) => {
        if (r.kind === 'info') return 'Возврат тикета';
        if (r.kind === 'expense' && r.category === 'брокер') return 'Пополнение брокерского счёта';
        if (r.kind === 'expense' && r.category === 'контрагент') return 'Оплата поставщику';
        return r.category;
      },
    },
    {
      key: 'counterparty',
      header: 'Контрагент',
      render: (r) => {
        if (r.kind === 'info') return r.ticket_number ? `Тикет ${r.ticket_number} → брокерский счёт` : 'Брокерский счёт';
        if (r.kind === 'income') {
          const name = r.client_name || '—';
          return r.payer_name ? `${name} (${r.payer_name})` : name;
        }
        if (r.category === 'брокер') return 'Брокерский счёт';
        if (r.category === 'контрагент') return r.client_name || '—';
        return r.zavod_name || r.carrier_name || r.machine_number || '—';
      },
    },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) =>
        r.kind === 'info' ? (
          <div className="text-muted-foreground">
            <div>{formatMoney(r.amount)}</div>
            <div className="text-xs">в кассу не поступает</div>
          </div>
        ) : (
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
    { key: 'payment_type', header: 'Способ', render: (r) => (r.kind === 'info' ? '—' : r.payment_type) },
    {
      key: 'comment',
      header: 'Комментарий',
      render: (r) => (r.kind === 'info' ? r.description || 'Остаток тикета возвращён на брокерский счёт' : r.comment || '—'),
    },
  ];

  return (
    <div>
      <PageHeader title="Касса" subtitle="Приход и расход денег — единым списком" />

      <h2 className="mb-2 text-sm font-semibold">Касса в сумах (остаток на сегодня)</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Наличные" value={formatMoney(cashBalances.data?.uzs.наличка ?? 0)} />
        <StatCard label="Карта" value={formatMoney(cashBalances.data?.uzs.карта ?? 0)} />
        <StatCard label="Перевод" value={formatMoney(cashBalances.data?.uzs.перечисление ?? 0)} />
      </div>
      <h2 className="mb-2 text-sm font-semibold">Касса в долларах (остаток на сегодня)</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Наличные" value={formatMoney(cashBalances.data?.usd.наличка ?? 0, 'USD')} />
        <StatCard label="Карта" value={formatMoney(cashBalances.data?.usd.карта ?? 0, 'USD')} />
        <StatCard label="Перевод" value={formatMoney(cashBalances.data?.usd.перечисление ?? 0, 'USD')} />
      </div>

      <h2 className="mb-2 text-sm font-semibold">{from || to ? 'Операции за выбранный период' : 'Операции за всё время'}</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Приход за период" value={formatMoney(periodTotals.income)} tone="positive" />
        <StatCard label="Расход за период" value={formatMoney(periodTotals.expense)} tone="negative" />
        <StatCard label="Разница" value={formatMoney(periodTotals.income - periodTotals.expense)} tone={periodTotals.income >= periodTotals.expense ? 'positive' : 'negative'} />
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
        onDelete={(row) => {
          const reason = readOnlyReason(row);
          if (reason) notify(reason, 'error');
          else setDeleting(row);
        }}
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
                <SuggestInput {...register('payer_name')} options={suggestions.data?.payers ?? []} placeholder="Например, другая фирма" />
              </FormRow>
            )}

            {formKind === 'expense' && category === 'контрагент' && (
              <div className="space-y-1.5">
                <FormRow label="Поставщик (клиент)" error={formState.errors.client_id?.message}>
                  <RHFSelect control={control} name="client_id" options={clientOptions} />
                </FormRow>
                <p className="text-xs text-muted-foreground">
                  Деньги, которые мы платим фирме, у которой покупаем цемент. Уменьшает то, что мы ей должны.
                </p>
              </div>
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
                <SuggestInput {...register('machine_number')} options={suggestions.data?.plates ?? []} />
                {machineMissing && (
                  <p className="mt-1.5 flex items-center justify-between gap-2 text-xs text-amber-700">
                    <span>Машины с номером {normalizePlateNumber(machineNumberWatch)} нет в базе «Свои машины» — её нужно добавить.</span>
                    <Button type="button" variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs" onClick={addMachineToBase}>
                      Добавить в базу
                    </Button>
                  </p>
                )}
              </FormRow>
            )}
            {formKind === 'expense' && category === 'перевозчик' && (
              <FormRow label="Перевозчик" error={formState.errors.carrier_name?.message}>
                <SuggestInput
                  {...register('carrier_name', { required: 'Укажите перевозчика' })}
                  placeholder="Имя или номер машины"
                  options={[...new Set([...(carrierBalances.data ?? []).map((c) => c.name), ...(suggestions.data?.carriers ?? [])])]}
                />
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
            {formKind === 'expense' && category === 'логистика' && (
              <FormRow label="Тип расхода" error={formState.errors.expense_type?.message}>
                {expenseTypeOptions.length > 0 ? (
                  <RHFSelect control={control} name="expense_type" options={expenseTypeOptions} />
                ) : (
                  <>
                    <SuggestInput
                      {...register('expense_type', { required: 'Укажите тип расхода' })}
                      options={suggestions.data?.expenseTypes ?? []}
                      placeholder="газ / запчасть / зп / обед"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Чтобы выбирать из списка, добавьте типы в «Контрагенты → Категории расходов логистики».
                    </p>
                  </>
                )}
              </FormRow>
            )}
            {formKind === 'expense' && category !== 'перевозчик' && category !== 'логистика' && (
              <FormRow label="Тип расхода" error={formState.errors.expense_type?.message}>
                <SuggestInput
                  {...register('expense_type', { required: 'Укажите тип расхода' })}
                  options={suggestions.data?.expenseTypes ?? []}
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
