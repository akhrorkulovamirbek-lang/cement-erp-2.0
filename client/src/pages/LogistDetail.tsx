import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useLogistAction, useLogistDetail } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { RHFButtonGroup } from '@/components/ButtonGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { SidePanel } from '@/components/SidePanel';
import { StatCard } from '@/components/StatCard';
import { FormRow, Input } from '@/components/form';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney, formatNumber, todayISO } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { LogistDetailData } from '@/types';

type Trip = LogistDetailData['trips'][number];
type Payment = LogistDetailData['payments'][number];
type Machine = LogistDetailData['machines'][number];
type Adjustment = LogistDetailData['adjustments'][number];

interface AdjustForm {
  date: string;
  direction: 'increase' | 'decrease';
  amount: string;
  comment: string;
}
interface MachineForm {
  number: string;
  model: string;
  driver: string;
}

/** Карточка логиста: сколько мы ему должны, его машины, рейсы, выплаты и корректировки долга. */
export function LogistDetail() {
  const { id } = useParams<{ id: string }>();
  const logistId = Number(id);
  const { notify } = useToast();
  const detail = useLogistDetail(logistId);
  const actions = useLogistAction();
  const data = detail.data;

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [machineOpen, setMachineOpen] = useState(false);
  const [removingMachine, setRemovingMachine] = useState<Machine | null>(null);
  const [removingAdjustment, setRemovingAdjustment] = useState<Adjustment | null>(null);
  const adjustForm = useForm<AdjustForm>({ defaultValues: { date: todayISO(), direction: 'increase', amount: '', comment: '' } });
  const machineForm = useForm<MachineForm>({ defaultValues: { number: '', model: '', driver: '' } });

  const fail = (err: unknown) => notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');

  async function onAdjust(values: AdjustForm) {
    const amount = Number(values.amount);
    try {
      await actions.addAdjustment.mutateAsync({
        id: logistId,
        date: values.date,
        amount: values.direction === 'increase' ? amount : -amount,
        comment: values.comment,
      });
      notify('Долг скорректирован');
      setAdjustOpen(false);
    } catch (err) {
      fail(err);
    }
  }

  async function onAddMachine(values: MachineForm) {
    try {
      await actions.addMachine.mutateAsync({ id: logistId, number: values.number, model: values.model || null, driver: values.driver || null });
      notify('Машина добавлена');
      setMachineOpen(false);
    } catch (err) {
      fail(err);
    }
  }

  const summary = data?.summary;
  const balance = Number(summary?.balance ?? 0);

  const machineColumns: Column<Machine>[] = [
    {
      key: 'number',
      header: 'Госномер',
      render: (r) => (
        <Link to={`/vehicles/${encodeURIComponent(r.number)}`} className="font-medium text-primary hover:underline">
          {r.number}
        </Link>
      ),
    },
    { key: 'driver', header: 'Водитель', render: (r) => r.driver || '—' },
    { key: 'model', header: 'Модель', render: (r) => r.model || '—' },
  ];

  const tripColumns: Column<Trip>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'client_name', header: 'Клиент', render: (r) => r.client_name ?? '—' },
    {
      key: 'machine_number',
      header: 'Машина',
      render: (r) =>
        r.machine_number ? (
          <Link to={`/vehicles/${encodeURIComponent(r.machine_number)}`} className="text-primary hover:underline">
            {r.machine_number}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'route', header: 'Маршрут', render: (r) => r.route || '—' },
    { key: 'tonnage', header: 'Тоннаж', align: 'right', sortValue: (r) => Number(r.tonnage), render: (r) => `${formatNumber(r.tonnage, 2)} т` },
    { key: 'hire_total', header: 'Ему начислено', align: 'right', sortValue: (r) => Number(r.hire_total), render: (r) => formatMoney(r.hire_total) },
    { key: 'awaiting_shipment', header: 'Статус', render: (r) => (r.awaiting_shipment ? <Badge tone="amber">Ждёт отгрузки</Badge> : '') },
  ];

  const paymentColumns: Column<Payment>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => Number(r.amount_uzs),
      render: (r) => <MoneyCell amount={r.amount} currency={r.currency} usdRate={r.usd_rate} />,
    },
    { key: 'payment_type', header: 'Способ' },
    { key: 'comment', header: 'Комментарий', render: (r) => r.comment || '—' },
  ];

  const adjustmentColumns: Column<Adjustment>[] = [
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'amount',
      header: 'Изменение долга',
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <span className={Number(r.amount) > 0 ? 'font-medium text-destructive' : 'font-medium text-emerald-600'}>
          {Number(r.amount) > 0 ? '+' : '−'}
          {formatMoney(Math.abs(Number(r.amount)))}
        </span>
      ),
    },
    { key: 'comment', header: 'Причина' },
  ];

  return (
    <div>
      <Link to="/counterparties" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Контрагенты
      </Link>
      <PageHeader
        title={data?.logist.name ?? '...'}
        subtitle={[data?.logist.phone, data && !data.logist.active ? 'отключён' : null].filter(Boolean).join(' · ') || undefined}
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button variant="outline" onClick={() => { machineForm.reset({ number: '', model: '', driver: '' }); setMachineOpen(true); }}>
              + Машина
            </Button>
            <Button variant="outline" onClick={() => { adjustForm.reset({ date: todayISO(), direction: 'increase', amount: '', comment: '' }); setAdjustOpen(true); }}>
              Корректировка долга
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Начислено за рейсы (с долгом)" value={formatMoney(summary?.owed ?? 0)} />
        <StatCard label="Выплачено" value={formatMoney(summary?.paid ?? 0)} />
        <StatCard
          label={balance < 0 ? 'Он должен нам' : 'Мы должны ему'}
          value={formatMoney(Math.abs(balance))}
          tone={balance > 0 ? 'negative' : 'positive'}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Машины</h2>
      <div className="mb-6">
        <DataTable
          columns={machineColumns}
          rows={data?.machines ?? []}
          loading={detail.isLoading}
          getRowId={(r) => r.id}
          onDelete={setRemovingMachine}
          emptyMessage="Машин пока нет — добавьте кнопкой «+ Машина»"
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Рейсы</h2>
      <div className="mb-6">
        <DataTable columns={tripColumns} rows={data?.trips ?? []} loading={detail.isLoading} getRowId={(r) => r.id} emptyMessage="Рейсов пока нет" />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Выплаты ему (касса)</h2>
      <div className="mb-6">
        <DataTable columns={paymentColumns} rows={data?.payments ?? []} loading={detail.isLoading} getRowId={(r) => r.id} emptyMessage="Выплат пока нет" />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Корректировки долга</h2>
      <DataTable
        columns={adjustmentColumns}
        rows={data?.adjustments ?? []}
        loading={detail.isLoading}
        getRowId={(r) => r.id}
        onDelete={setRemovingAdjustment}
        emptyMessage="Корректировок пока нет"
      />

      {adjustOpen && (
        <SidePanel title="Корректировка долга логисту" onClose={() => setAdjustOpen(false)}>
          <form onSubmit={adjustForm.handleSubmit(onAdjust)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Исправляет долг без рейса и выплаты — например, ошибка в старых записях или скидка. Причину укажите обязательно.
            </p>
            <FormRow label="Дата">
              <Input type="date" {...adjustForm.register('date', { required: true })} />
            </FormRow>
            <FormRow label="Что сделать с долгом">
              <RHFButtonGroup
                control={adjustForm.control}
                name="direction"
                options={[
                  { value: 'increase', label: 'Мы должны ему больше' },
                  { value: 'decrease', label: 'Мы должны ему меньше' },
                ]}
              />
            </FormRow>
            <FormRow label="Сумма, сум" error={adjustForm.formState.errors.amount?.message}>
              <Input
                type="number"
                step="0.01"
                {...adjustForm.register('amount', { required: 'Укажите сумму', validate: (v) => Number(v) > 0 || 'Сумма должна быть больше нуля' })}
              />
            </FormRow>
            <FormRow label="Причина" error={adjustForm.formState.errors.comment?.message}>
              <Input {...adjustForm.register('comment', { required: 'Укажите причину' })} placeholder="Например: скидка / ошибка в записи" />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={adjustForm.formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {machineOpen && (
        <SidePanel title="Добавить машину логисту" onClose={() => setMachineOpen(false)}>
          <form onSubmit={machineForm.handleSubmit(onAddMachine)} className="space-y-4">
            <FormRow label="Госномер" error={machineForm.formState.errors.number?.message}>
              <Input autoFocus {...machineForm.register('number', { required: 'Укажите госномер' })} placeholder="01A123BC" />
            </FormRow>
            <FormRow label="Водитель (необязательно)">
              <Input {...machineForm.register('driver')} />
            </FormRow>
            <FormRow label="Модель (необязательно)">
              <Input {...machineForm.register('model')} />
            </FormRow>
            <p className="text-xs text-muted-foreground">В продаже при вводе этого номера логист подставится сам.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMachineOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={machineForm.formState.isSubmitting}>
                Добавить
              </Button>
            </div>
          </form>
        </SidePanel>
      )}

      {removingMachine && (
        <ConfirmDialog
          title="Убрать машину?"
          message={`Машина ${removingMachine.number} перестанет быть записана за этим логистом. Старые рейсы останутся.`}
          onConfirm={async () => {
            try {
              await actions.removeMachine.mutateAsync(removingMachine.id);
              notify('Машина убрана');
            } catch (err) {
              fail(err);
            } finally {
              setRemovingMachine(null);
            }
          }}
          onCancel={() => setRemovingMachine(null)}
        />
      )}

      {removingAdjustment && (
        <ConfirmDialog
          title="Удалить корректировку?"
          message="Долг логиста вернётся к значению без этой корректировки."
          onConfirm={async () => {
            try {
              await actions.removeAdjustment.mutateAsync(removingAdjustment.id);
              notify('Корректировка удалена');
            } catch (err) {
              fail(err);
            } finally {
              setRemovingAdjustment(null);
            }
          }}
          onCancel={() => setRemovingAdjustment(null)}
        />
      )}
    </div>
  );
}
