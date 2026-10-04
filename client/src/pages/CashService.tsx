import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { bankAccountsHooks, cashServiceHooks, useAppSettings, useCashServiceSummary } from '@/api/modules';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { StatCard } from '@/components/StatCard';
import { FormRow, Input, RHFSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatMoney, todayISO } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { CashServiceOperation } from '@/types';

interface CashServiceForm {
  date: string;
  bank_account_id: string;
  counterparty_name: string;
  counterparty_phone: string;
  transfer_amount: string;
  usd_rate: string;
  commission_amount: string;
  comment: string;
}

const emptyForm = (): CashServiceForm => ({
  date: todayISO(),
  bank_account_id: '',
  counterparty_name: '',
  counterparty_phone: '',
  transfer_amount: '',
  usd_rate: '',
  commission_amount: '',
  comment: '',
});

/** Раздел 9.1 ТЗ (следующий этап): приём перевода на банковский счёт, выдача наличных за
 * вычетом комиссии. Выдача автоматически отражается в Кассе связанной строкой расхода. */
export function CashService() {
  const { notify } = useToast();
  const bankAccounts = bankAccountsHooks.useList();
  const appSettings = useAppSettings();
  const activeAccounts = (bankAccounts.data ?? []).filter((a) => a.active);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = cashServiceHooks.useList({ from: from || undefined, to: to || undefined });
  const summary = useCashServiceSummary({ from: from || undefined, to: to || undefined });
  const create = cashServiceHooks.useCreate();
  const update = cashServiceHooks.useUpdate();
  const del = cashServiceHooks.useDelete();

  const [editing, setEditing] = useState<CashServiceOperation | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CashServiceOperation | null>(null);
  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<CashServiceForm>({
    defaultValues: emptyForm(),
  });

  const bankAccountId = watch('bank_account_id');
  const selectedAccount = bankAccounts.data?.find((a) => String(a.id) === bankAccountId);
  const currency = selectedAccount?.currency ?? 'UZS';
  const transferAmount = Number(watch('transfer_amount') || 0);
  const commissionAmount = Number(watch('commission_amount') || 0);
  const payoutAmount = Math.max(transferAmount - commissionAmount, 0);
  const defaultCommissionPercent = Number(appSettings.data?.cash_service_default_commission_percent ?? 0);

  function openNew() {
    reset(emptyForm());
    setEditing('new');
  }
  function openEdit(row: CashServiceOperation) {
    reset({
      date: row.date,
      bank_account_id: String(row.bank_account_id),
      counterparty_name: row.counterparty_name ?? '',
      counterparty_phone: row.counterparty_phone ?? '',
      transfer_amount: row.transfer_amount,
      usd_rate: row.usd_rate ?? '',
      commission_amount: row.commission_amount,
      comment: row.comment ?? '',
    });
    setEditing(row);
  }

  function applyDefaultCommission() {
    const amount = Math.round(transferAmount * defaultCommissionPercent) / 100;
    setValue('commission_amount', String(amount));
  }

  async function onSubmit(data: CashServiceForm) {
    const payload = {
      date: data.date,
      bank_account_id: Number(data.bank_account_id),
      counterparty_name: data.counterparty_name || null,
      counterparty_phone: data.counterparty_phone || null,
      transfer_amount: Number(data.transfer_amount),
      currency,
      usd_rate: currency === 'USD' ? Number(data.usd_rate) : null,
      commission_amount: Number(data.commission_amount || 0),
      comment: data.comment || null,
    };
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload);
        notify('Операция добавлена');
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

  const columns: Column<CashServiceOperation>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'bank_account_name', header: 'Счёт' },
    { key: 'counterparty_name', header: 'Контрагент', render: (r) => r.counterparty_name || '—' },
    {
      key: 'transfer_amount',
      header: 'Перевод',
      align: 'right',
      sortValue: (r) => Number(r.transfer_amount),
      render: (r) => <MoneyCell amount={r.transfer_amount} currency={r.currency} usdRate={r.usd_rate} />,
    },
    {
      key: 'commission_amount',
      header: 'Комиссия',
      align: 'right',
      sortValue: (r) => Number(r.commission_amount),
      render: (r) => (
        <div className="text-emerald-600">
          <MoneyCell amount={r.commission_amount} currency={r.currency} usdRate={r.usd_rate} />
        </div>
      ),
    },
    {
      key: 'payout_amount',
      header: 'К выдаче',
      align: 'right',
      sortValue: (r) => Number(r.payout_amount),
      render: (r) => <MoneyCell amount={r.payout_amount} currency={r.currency} usdRate={r.usd_rate} />,
    },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <PageHeader title="Обналичивание" subtitle="Приём перевода на счёт, выдача наличных за вычетом комиссии" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Комиссия за период" value={formatMoney(summary.data?.commissionTotal ?? 0)} tone="positive" />
        <StatCard label="Переводов за период" value={String(summary.data?.count ?? 0)} hint={`${formatMoney(summary.data?.transferTotal ?? 0)} всего`} />
      </div>

      {activeAccounts.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Остатки по счетам</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {activeAccounts.map((a) => (
                <li key={a.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{a.display_name}</span>
                  <span className="font-medium tabular-nums">{formatMoney(a.balance, a.currency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <Button className="shrink-0" onClick={openNew} disabled={activeAccounts.length === 0}>
          + Новая операция
        </Button>
      </div>
      {activeAccounts.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          Сначала добавьте банковский счёт во вкладке «Контрагенты → Банковские счета».
        </p>
      )}

      <DataTable columns={columns} rows={list.data ?? []} loading={list.isLoading} getRowId={(r) => r.id} onEdit={openEdit} onDelete={setDeleting} />

      {editing && (
        <SidePanel title={editing === 'new' ? 'Новая операция' : 'Изменить операцию'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <FormRow label="Банковский счёт">
              <RHFSelect
                control={control}
                name="bank_account_id"
                options={(bankAccounts.data ?? []).map((a) => ({ value: String(a.id), label: `${a.display_name} (${a.currency})` }))}
              />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Контрагент (необязательно)">
                <Input {...register('counterparty_name')} placeholder="Имя" />
              </FormRow>
              <FormRow label="Телефон (необязательно)">
                <Input {...register('counterparty_phone')} placeholder="+998 90 123 45 67" />
              </FormRow>
            </div>
            <FormRow label="Сумма перевода" error={formState.errors.transfer_amount?.message}>
              <Input type="number" step="0.01" {...register('transfer_amount', { required: 'Укажите сумму' })} />
            </FormRow>
            {currency === 'USD' && (
              <FormRow label="Курс доллара" error={formState.errors.usd_rate?.message}>
                <Input type="number" step="0.01" {...register('usd_rate', { required: 'Укажите курс' })} />
              </FormRow>
            )}
            <FormRow label="Комиссия" error={formState.errors.commission_amount?.message}>
              <Input type="number" step="0.01" {...register('commission_amount')} />
              {defaultCommissionPercent > 0 && transferAmount > 0 && (
                <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={applyDefaultCommission}>
                  Применить {defaultCommissionPercent}% по умолчанию
                </Button>
              )}
            </FormRow>
            <div className="rounded-md border bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">К выдаче наличными: </span>
              <span className="font-semibold">{formatMoney(payoutAmount, currency)}</span>
            </div>
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
          message="Связанная выдача в Кассе тоже удалится. Это действие нельзя отменить."
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
