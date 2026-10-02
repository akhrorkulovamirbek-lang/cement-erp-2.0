import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import {
  cashIncomeHooks,
  cementMarksHooks,
  clientsHooks,
  incomingHooks,
  salesHooks,
  useClientBalances,
  zavodyHooks,
} from '@/api/modules';
import { Badge } from '@/components/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { MoneyFields } from '@/components/MoneyFields';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { StatCard } from '@/components/StatCard';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { FormRow, Input, RHFSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { PACKAGING_OPTIONS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber, todayISO } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { CashIncome, Incoming, Sale } from '@/types';

interface PayDebtForm {
  date: string;
  amount: string;
  currency: 'UZS' | 'USD';
  usd_rate: string;
  payment_type: 'перечисление' | 'наличка' | 'карта';
  comment: string;
}

const emptyPayDebtForm = (): PayDebtForm => ({
  date: todayISO(),
  amount: '',
  currency: 'UZS',
  usd_rate: '',
  payment_type: 'перечисление',
  comment: '',
});

interface PayGoodsForm {
  date: string;
  zavod_id: string;
  cement_mark_id: string;
  packaging: 'MESHOK' | 'NAVAL';
  tonnage: string;
  price_per_ton: string;
  comment: string;
}

const emptyPayGoodsForm = (): PayGoodsForm => ({
  date: todayISO(),
  zavod_id: '',
  cement_mark_id: '',
  packaging: 'MESHOK',
  tonnage: '',
  price_per_ton: '',
  comment: '',
});

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const { notify } = useToast();

  const clients = clientsHooks.useList();
  const balances = useClientBalances();
  const sales = salesHooks.useList({ client_id: clientId });
  const payments = cashIncomeHooks.useList({ client_id: clientId });
  const payDebt = cashIncomeHooks.useCreate();
  const goodsPaymentsList = incomingHooks.useList({ client_id: clientId });
  const payGoods = incomingHooks.useCreate();
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();

  const client = clients.data?.find((c) => c.id === clientId);
  const balance = balances.data?.find((b) => b.id === clientId);
  const goodsPayments = (goodsPaymentsList.data ?? []).filter((r) => r.warehouse === 'CLIENT_GOODS');

  const [payOpen, setPayOpen] = useState(false);
  const { register, control, handleSubmit, reset, watch, formState } = useForm<PayDebtForm>({
    defaultValues: emptyPayDebtForm(),
  });

  const [payGoodsOpen, setPayGoodsOpen] = useState(false);
  const goodsForm = useForm<PayGoodsForm>({ defaultValues: emptyPayGoodsForm() });

  function openPayDebt() {
    reset(emptyPayDebtForm());
    setPayOpen(true);
  }

  function openPayGoods() {
    goodsForm.reset(emptyPayGoodsForm());
    setPayGoodsOpen(true);
  }

  async function onPayGoods(data: PayGoodsForm) {
    try {
      await payGoods.mutateAsync({
        date: data.date,
        warehouse: 'CLIENT_GOODS',
        zavod_id: Number(data.zavod_id),
        cement_mark_id: Number(data.cement_mark_id),
        packaging: data.packaging,
        tonnage: Number(data.tonnage),
        price_per_ton: Number(data.price_per_ton),
        client_id: clientId,
        comment: data.comment || null,
      } as never);
      notify('Долг погашен товаром');
      setPayGoodsOpen(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onPayDebt(data: PayDebtForm) {
    try {
      await payDebt.mutateAsync({
        date: data.date,
        category: 'цемент',
        client_id: clientId,
        amount: Number(data.amount),
        currency: data.currency,
        usd_rate: data.currency === 'USD' ? Number(data.usd_rate) : null,
        payment_type: data.payment_type,
        comment: data.comment || null,
      } as never);
      notify('Долг погашен');
      setPayOpen(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  const salesColumns: Column<Sale>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'sale_type',
      header: 'Тип',
      render: (r) => (r.sale_type === 'CEMENT' ? <Badge tone="slate">Цемент</Badge> : <Badge tone="blue">Логистика</Badge>),
    },
    { key: 'cement_mark_name', header: 'Марка', render: (r) => r.cement_mark_name ?? '—' },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 2)} т`,
    },
    {
      key: 'total_sum',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.total_sum),
      render: (r) => formatMoney(r.total_sum),
    },
    {
      key: 'source',
      header: 'Источник',
      render: (r) => {
        if (r.sale_type === 'LOGISTICS') return '—';
        if (r.source === 'ticket') return <Badge tone="blue">Тикет {r.ticket_number}</Badge>;
        if (r.source === 'direct') return <Badge tone="amber">Напрямую</Badge>;
        return <Badge tone="slate">Склад</Badge>;
      },
    },
    {
      key: 'margin_total',
      header: 'Маржа',
      align: 'right',
      sortValue: (r) => Number(r.margin_total),
      render: (r) => (r.sale_type === 'CEMENT' ? formatMoney(r.margin_total) : '—'),
    },
  ];

  const paymentColumns: Column<CashIncome>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'category', header: 'Категория' },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => formatMoney(r.amount, r.currency),
    },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  const goodsColumns: Column<Incoming>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'cement_mark_name', header: 'Марка' },
    {
      key: 'tonnage',
      header: 'Тоннаж',
      align: 'right',
      sortValue: (r) => Number(r.tonnage),
      render: (r) => `${formatNumber(r.tonnage, 3)} т`,
    },
    {
      key: 'total_sum',
      header: 'На сумму',
      align: 'right',
      sortValue: (r) => Number(r.total_sum),
      render: (r) => formatMoney(r.total_sum),
    },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  return (
    <div>
      <Link to="/counterparties" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Контрагенты
      </Link>
      <PageHeader
        title={client?.name ?? '...'}
        subtitle={client?.phone ?? undefined}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openPayGoods}>
              Погасить товаром
            </Button>
            <Button onClick={openPayDebt}>Погасить долг</Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Куплено всего" value={formatMoney(balance?.purchased ?? 0)} />
        <StatCard label="Оплачено всего" value={formatMoney(balance?.paid ?? 0)} />
        <StatCard
          label="Текущий долг"
          value={formatMoney(balance?.balance ?? 0)}
          tone={Number(balance?.balance ?? 0) > 0 ? 'negative' : 'positive'}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Взял (история продаж)</h2>
      <div className="mb-6">
        <DataTable
          columns={salesColumns}
          rows={sales.data ?? []}
          loading={sales.isLoading}
          getRowId={(r) => r.id}
          emptyMessage="Продаж пока нет"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Оплатил (история платежей)</h2>
      <div className="mb-6">
        <DataTable
          columns={paymentColumns}
          rows={payments.data ?? []}
          loading={payments.isLoading}
          getRowId={(r) => r.id}
          emptyMessage="Платежей пока нет"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Оплатил товаром</h2>
      <DataTable
        columns={goodsColumns}
        rows={goodsPayments}
        loading={goodsPaymentsList.isLoading}
        getRowId={(r) => r.id}
        emptyMessage="Оплат товаром пока нет"
      />

      {payOpen && (
        <SidePanel title="Погасить долг" onClose={() => setPayOpen(false)}>
          <form onSubmit={handleSubmit(onPayDebt)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...register('date', { required: true })} />
            </FormRow>
            <MoneyFields control={control} register={register} watch={watch} errors={formState.errors} />
            <FormRow label="Комментарий (необязательно)">
              <Input {...register('comment')} />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {payGoodsOpen && (
        <SidePanel title="Погасить товаром" onClose={() => setPayGoodsOpen(false)}>
          <form onSubmit={goodsForm.handleSubmit(onPayGoods)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...goodsForm.register('date', { required: true })} />
            </FormRow>
            <FormRow label="Завод" error={goodsForm.formState.errors.zavod_id?.message}>
              <RHFSelect
                control={goodsForm.control}
                name="zavod_id"
                options={(zavody.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))}
              />
            </FormRow>
            <FormRow label="Марка цемента" error={goodsForm.formState.errors.cement_mark_id?.message}>
              <RHFSelect
                control={goodsForm.control}
                name="cement_mark_id"
                options={(cementMarks.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
              />
            </FormRow>
            <FormRow label="Упаковка">
              <RHFButtonGroup control={goodsForm.control} name="packaging" options={PACKAGING_OPTIONS} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Тоннаж" error={goodsForm.formState.errors.tonnage?.message}>
                <Input type="number" step="0.001" {...goodsForm.register('tonnage', { required: 'Укажите тоннаж' })} />
              </FormRow>
              <FormRow label="Цена за тонну" error={goodsForm.formState.errors.price_per_ton?.message}>
                <Input type="number" step="0.01" {...goodsForm.register('price_per_ton', { required: 'Укажите цену' })} />
              </FormRow>
            </div>
            <p className="text-xs text-muted-foreground">
              Долг клиента уменьшится на тоннаж × цену за тонну. Цемент поступит на обычный склад.
            </p>
            <FormRow label="Комментарий (необязательно)">
              <Input {...goodsForm.register('comment')} />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayGoodsOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={goodsForm.formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}
    </div>
  );
}
