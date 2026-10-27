import { pool } from '../../db/pool.js';
import { currentOrgId } from '../../db/tenant.js';
import { UZS_EXPENSE, UZS_INCOME } from '../reports/routes.js';
import { balanceLine, balanceOf, fmt } from './clientBot.js';
import { getOrgBot, tg } from './telegram.js';

/** Уведомления клиентам в Телеграм о новых операциях: продажа и оплата. Вызываются уже после
 * сохранения операции и никогда не ломают её: любая ошибка только пишется в лог. Сообщение уходит
 * всем людям, подключённым к боту от имени клиента. Массовый импорт истории уведомлений не шлёт. */

const PACKAGING: Record<string, string> = { MESHOK: 'мешок', NAVAL: 'навал' };
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtT = (v: unknown) => Number(Number(v).toFixed(3)).toLocaleString('ru-RU');

async function sendToClient(clientId: number | null | undefined, build: () => Promise<string | null>): Promise<void> {
  try {
    const orgId = currentOrgId();
    if (!clientId || orgId == null) return;
    const bot = await getOrgBot(orgId);
    if (!bot) return;
    const { rows: people } = await pool.query('SELECT telegram_id FROM bot_client_links WHERE client_id = $1 AND telegram_id IS NOT NULL', [clientId]);
    if (people.length === 0) return;
    const text = await build();
    if (!text) return;
    const b = await balanceOf(clientId);
    const full = `${text}\n\n${balanceLine(Number(b.balance))}`;
    for (const p of people) {
      await tg(bot.token, 'sendMessage', { chat_id: p.telegram_id, text: full }).catch((err) => console.error('client notify:', err instanceof Error ? err.message : err));
    }
  } catch (err) {
    console.error('client notify:', err instanceof Error ? err.message : err);
  }
}

export function notifySale(saleId: number | null | undefined): void {
  if (!saleId) return;
  void (async () => {
    const { rows } = await pool.query(
      `SELECT s.client_id, s.date, s.sale_type, s.tonnage, s.price_per_ton, s.freight_price_per_ton, s.vehicle_type, s.total_sum,
              cm.name AS mark, s.packaging, COALESCE(ov.number, s.machine_number) AS machine
       FROM sales s LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
       WHERE s.id = $1`,
      [saleId],
    );
    const s = rows[0];
    // «Отложка» без клиента или без суммы клиенту пока не показываем — сумма ещё неизвестна.
    if (!s || !s.client_id || !(Number(s.total_sum) > 0)) return;
    await sendToClient(s.client_id, async () => {
      const lines = [`🛒 Новая покупка · ${dmy(s.date)}`];
      if (s.sale_type === 'CEMENT') {
        lines.push(`Цемент ${s.mark ?? ''}${s.packaging ? ` (${PACKAGING[s.packaging] ?? s.packaging})` : ''}`, `${fmtT(s.tonnage)} т × ${fmt(s.price_per_ton)} сум`);
        if (s.vehicle_type !== 'CLIENT' && Number(s.freight_price_per_ton) > 0) lines.push(`+ перевозка ${fmt(Number(s.tonnage) * Number(s.freight_price_per_ton))} сум`);
      } else {
        lines.push('Перевозка', `${fmtT(s.tonnage)} т × ${fmt(s.freight_price_per_ton)} сум`);
      }
      lines.push(`Сумма: ${fmt(s.total_sum)} сум`);
      if (s.machine) lines.push(`Машина: ${s.machine}`);
      return lines.join('\n');
    });
  })().catch((e) => console.error('notifySale:', e instanceof Error ? e.message : e));
}

export function notifyPayment(incomeId: number | null | undefined): void {
  if (!incomeId) return;
  void (async () => {
    const { rows } = await pool.query(
      `SELECT client_id, date, payment_type, currency, amount, usd_rate, (${UZS_INCOME}) AS uzs FROM cash_income WHERE id = $1`,
      [incomeId],
    );
    const r = rows[0];
    if (!r?.client_id) return;
    await sendToClient(r.client_id, async () => {
      const shown = r.currency === 'USD' ? `$${fmt(r.amount)} (курс ${fmt(r.usd_rate)}) = ${fmt(r.uzs)} сум` : `${fmt(r.uzs)} сум`;
      return `💵 Получена оплата · ${dmy(r.date)}\n${shown} (${r.payment_type})`;
    });
  })().catch((e) => console.error('notifyPayment:', e instanceof Error ? e.message : e));
}

/** Оплата цементом (взаимозачёт): клиент отдал цемент в счёт долга. */
export function notifyGoodsPayment(incomingId: number | null | undefined): void {
  if (!incomingId) return;
  void (async () => {
    const { rows } = await pool.query(
      `SELECT i.client_id, i.date, i.tonnage, i.total_sum, cm.name AS mark FROM incoming i
       LEFT JOIN cement_marks cm ON cm.id = i.cement_mark_id WHERE i.id = $1 AND i.warehouse = 'CLIENT_GOODS'`,
      [incomingId],
    );
    const r = rows[0];
    if (!r?.client_id) return;
    await sendToClient(r.client_id, async () => `💵 Принят цемент в счёт оплаты · ${dmy(r.date)}\n${r.mark ?? 'Цемент'}, ${fmtT(r.tonnage)} т на ${fmt(r.total_sum)} сум`);
  })().catch((e) => console.error('notifyGoodsPayment:', e instanceof Error ? e.message : e));
}

/** Мы выплатили деньги клиенту-поставщику. */
export function notifyPaidToClient(expenseId: number | null | undefined): void {
  if (!expenseId) return;
  void (async () => {
    const { rows } = await pool.query(`SELECT client_id, date, (${UZS_EXPENSE}) AS uzs FROM cash_expense WHERE id = $1 AND category = 'контрагент'`, [expenseId]);
    const r = rows[0];
    if (!r?.client_id) return;
    await sendToClient(r.client_id, async () => `💸 Мы выплатили вам · ${dmy(r.date)}\n${fmt(r.uzs)} сум`);
  })().catch((e) => console.error('notifyPaidToClient:', e instanceof Error ? e.message : e));
}
