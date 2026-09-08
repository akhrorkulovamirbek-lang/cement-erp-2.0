import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Badge } from '../components/Badge';
import { Button, FormRow, Input, Select } from '../components/form';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { formatDate, formatMoney, formatNumber, todayISO } from '../lib/format';
import { useBrokerAccount, useReplenishBroker, ticketsHooks, useCloseTicket, zavodyHooks, cementMarksHooks } from '../api/modules';
import type { Ticket } from '../types';

interface TicketForm {
  date: string;
  ticket_number: string;
  zavod_id: string;
  cement_mark_id: string;
  tonnage: string;
  price_per_ton: string;
}

interface ReplenishForm {
  date: string;
  amount: string;
  description: string;
}

export function Exchange() {
  const { notify } = useToast();
  const broker = useBrokerAccount();
  const replenish = useReplenishBroker();
  const tickets = ticketsHooks.useList();
  const createTicket = ticketsHooks.useCreate();
  const updateTicket = ticketsHooks.useUpdate();
  const deleteTicket = ticketsHooks.useDelete();
  const closeTicket = useCloseTicket();
  const zavody = zavodyHooks.useList();
  const cementMarks = cementMarksHooks.useList();

  const [showReplenish, setShowReplenish] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | 'new' | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const [closingTicket, setClosingTicket] = useState<Ticket | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const replenishForm = useForm<ReplenishForm>({ defaultValues: { date: todayISO(), amount: '', description: '' } });
  const ticketForm = useForm<TicketForm>();

  async function onReplenish(data: ReplenishForm) {
    try {
      await replenish.mutateAsync({ date: data.date, amount: Number(data.amount), description: data.description || undefined });
      notify('Счёт пополнен');
      setShowReplenish(false);
      replenishForm.reset({ date: todayISO(), amount: '', description: '' });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  function openNewTicket() {
    ticketForm.reset({ date: todayISO(), ticket_number: '', zavod_id: '', cement_mark_id: '', tonnage: '', price_per_ton: '' });
    setEditingTicket('new');
  }
  function openEditTicket(t: Ticket) {
    ticketForm.reset({
      date: t.date,
      ticket_number: t.ticket_number,
      zavod_id: String(t.zavod_id),
      cement_mark_id: String(t.cement_mark_id),
      tonnage: t.bought_tonnage,
      price_per_ton: t.price_per_ton,
    });
    setEditingTicket(t);
  }

  async function onSubmitTicket(data: TicketForm) {
    try {
      if (editingTicket === 'new') {
        await createTicket.mutateAsync({
          date: data.date,
          ticket_number: data.ticket_number,
          zavod_id: Number(data.zavod_id),
          cement_mark_id: Number(data.cement_mark_id),
          tonnage: Number(data.tonnage),
          price_per_ton: Number(data.price_per_ton),
        } as never);
        notify('Тикет куплен');
      } else if (editingTicket) {
        await updateTicket.mutateAsync({
          id: editingTicket.id,
          data: {
            ticket_number: data.ticket_number,
            zavod_id: Number(data.zavod_id),
            cement_mark_id: Number(data.cement_mark_id),
            price_per_ton: Number(data.price_per_ton),
          } as never,
        });
        notify('Тикет обновлён');
      }
      setEditingTicket(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    }
  }

  async function onDeleteTicket() {
    if (!deletingTicket) return;
    try {
      await deleteTicket.mutateAsync(deletingTicket.id);
      notify('Тикет удалён');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setDeletingTicket(null);
    }
  }

  async function onCloseTicket() {
    if (!closingTicket) return;
    try {
      await closeTicket.mutateAsync(closingTicket.id);
      notify('Тикет закрыт, остаток возвращён на счёт');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Ошибка', 'error');
    } finally {
      setClosingTicket(null);
    }
  }

  const columns: Column<Ticket>[] = [
    { key: 'ticket_number', header: 'Номер', sortValue: (r) => r.ticket_number },
    { key: 'date', header: 'Дата', sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    { key: 'zavod_name', header: 'Завод' },
    { key: 'cement_mark_name', header: 'Марка' },
    { key: 'bought_tonnage', header: 'Куплено, т', align: 'right', sortValue: (r) => Number(r.bought_tonnage), render: (r) => formatNumber(r.bought_tonnage, 2) },
    { key: 'price_per_ton', header: 'Цена/т', align: 'right', sortValue: (r) => Number(r.price_per_ton), render: (r) => formatMoney(r.price_per_ton) },
    {
      key: 'remaining_tonnage',
      header: 'Остаток, т',
      align: 'right',
      sortValue: (r) => Number(r.remaining_tonnage),
      render: (r) => formatNumber(r.remaining_tonnage, 2),
    },
    { key: 'remaining_sum', header: 'Остаток, сум', align: 'right', sortValue: (r) => Number(r.remaining_sum), render: (r) => formatMoney(r.remaining_sum) },
    {
      key: 'status',
      header: 'Статус',
      render: (r) => (r.status === 'active' ? <Badge tone="green">Активен</Badge> : <Badge tone="slate">Закрыт</Badge>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Биржа"
        subtitle="Брокерский счёт и тикеты"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowReplenish(true)}>
              + Пополнить счёт
            </Button>
            <Button onClick={openNewTicket}>+ Купить тикет</Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Баланс брокерского счёта" value={formatMoney(broker.data?.account.balance ?? 0)} />
        <StatCard label="Активных тикетов" value={String((tickets.data ?? []).filter((t) => t.status === 'active').length)} />
        <StatCard
          label="Остаток тоннажа по активным тикетам"
          value={`${formatNumber((tickets.data ?? []).filter((t) => t.status === 'active').reduce((s, t) => s + Number(t.remaining_tonnage), 0), 2)} т`}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Тикеты</h2>
        <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-medium text-brand-700 hover:underline">
          {showHistory ? 'Скрыть историю операций счёта' : 'Показать историю операций счёта'}
        </button>
      </div>

      {showHistory && (
        <div className="mb-4 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs">
          {(broker.data?.operations ?? []).map((op) => (
            <div key={op.id} className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
              <span className="text-slate-500">
                {formatDate(op.date)} — {op.description ?? op.type}
              </span>
              <span className={op.type === 'ticket_purchase' ? 'text-red-600' : 'text-emerald-600'}>
                {op.type === 'ticket_purchase' ? '-' : '+'}
                {formatMoney(op.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={tickets.data ?? []}
        loading={tickets.isLoading}
        getRowId={(r) => r.id}
        onEdit={openEditTicket}
        onDelete={setDeletingTicket}
        extraRowAction={(r) =>
          r.status === 'active' && (
            <button onClick={() => setClosingTicket(r)} className="rounded p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Закрыть тикет">
              🔒
            </button>
          )
        }
      />

      {showReplenish && (
        <Modal title="Пополнить брокерский счёт" onClose={() => setShowReplenish(false)}>
          <form onSubmit={replenishForm.handleSubmit(onReplenish)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...replenishForm.register('date', { required: true })} />
            </FormRow>
            <FormRow label="Сумма, сум" error={replenishForm.formState.errors.amount?.message}>
              <Input type="number" step="0.01" {...replenishForm.register('amount', { required: 'Укажите сумму' })} />
            </FormRow>
            <FormRow label="Комментарий (необязательно)">
              <Input {...replenishForm.register('description')} />
            </FormRow>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowReplenish(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={replenishForm.formState.isSubmitting}>
                Пополнить
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editingTicket && (
        <Modal title={editingTicket === 'new' ? 'Купить тикет' : 'Изменить тикет'} onClose={() => setEditingTicket(null)}>
          <form onSubmit={ticketForm.handleSubmit(onSubmitTicket)} className="space-y-4">
            <FormRow label="Дата">
              <Input type="date" {...ticketForm.register('date', { required: true })} disabled={editingTicket !== 'new'} />
            </FormRow>
            <FormRow label="Номер тикета" error={ticketForm.formState.errors.ticket_number?.message}>
              <Input {...ticketForm.register('ticket_number', { required: 'Укажите номер' })} placeholder="Cesam-001" />
            </FormRow>
            <FormRow label="Завод" error={ticketForm.formState.errors.zavod_id?.message}>
              <Select {...ticketForm.register('zavod_id', { required: 'Выберите завод' })}>
                <option value="">—</option>
                {(zavody.data ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Марка цемента" error={ticketForm.formState.errors.cement_mark_id?.message}>
              <Select {...ticketForm.register('cement_mark_id', { required: 'Выберите марку' })}>
                <option value="">—</option>
                {(cementMarks.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Тоннаж" error={ticketForm.formState.errors.tonnage?.message}>
                <Input type="number" step="0.001" {...ticketForm.register('tonnage', { required: 'Укажите тоннаж' })} disabled={editingTicket !== 'new'} />
              </FormRow>
              <FormRow label="Цена за тонну" error={ticketForm.formState.errors.price_per_ton?.message}>
                <Input type="number" step="0.01" {...ticketForm.register('price_per_ton', { required: 'Укажите цену' })} />
              </FormRow>
            </div>
            {editingTicket !== 'new' && <p className="text-xs text-slate-400">Тоннаж нельзя изменить после покупки. Изменение цены пересчитает маржу по продажам с этого тикета.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingTicket(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={ticketForm.formState.isSubmitting}>
                Сохранить
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deletingTicket && (
        <ConfirmDialog
          title="Удалить тикет?"
          message={`Удалить тикет «${deletingTicket.ticket_number}»? Возможно только если с него не было продаж — деньги вернутся на счёт.`}
          onConfirm={onDeleteTicket}
          onCancel={() => setDeletingTicket(null)}
        />
      )}

      {closingTicket && (
        <ConfirmDialog
          title="Закрыть тикет?"
          message={`Остаток тикета «${closingTicket.ticket_number}» (${formatNumber(closingTicket.remaining_tonnage, 2)} т, ${formatMoney(
            closingTicket.remaining_sum,
          )}) будет автоматически возвращён на брокерский счёт.`}
          confirmLabel="Закрыть"
          danger={false}
          onConfirm={onCloseTicket}
          onCancel={() => setClosingTicket(null)}
        />
      )}
    </div>
  );
}
