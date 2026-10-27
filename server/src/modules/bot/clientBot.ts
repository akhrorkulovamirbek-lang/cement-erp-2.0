import { pool } from '../../db/pool.js';
import { CLIENT_ADJ_PLUS_SUBQUERY, CLIENT_PAID_SUBQUERY, UZS_SALE } from '../reports/routes.js';
import { buildClientWorkbook } from './clientReport.js';
import { keyboard, sendDocument, tg, type Button } from './telegram.js';

/** Бот для клиентов: баланс, покупки и платежи за выбранный период. Клиент видит только свои данные —
 * client_id берётся из привязки в базе, а не из того, что он пишет боту. Закупочные цены, поставщиков
 * и нашу маржу здесь не показываем вовсе. */

export interface ClientLink {
  id: number;
  client_id: number;
  name: string;
}

const PACKAGING: Record<string, string> = { MESHOK: 'мешок', NAVAL: 'навал' };
const MAX_ROWS = 80;

const fmt = (v: unknown) => Math.round(Number(v)).toLocaleString('ru-RU');
const fmtT = (v: unknown) => Number(Number(v).toFixed(3)).toLocaleString('ru-RU');
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

function todayTashkent(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

const PERIOD_LABELS: Record<string, string> = { month: 'Этот месяц', prev: 'Прошлый месяц', '3m': '3 месяца', all: 'Всё время' };

function periodRange(period: string): { from: string | null; to: string | null; label: string } {
  const today = todayTashkent();
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (period === 'month') return { from: `${y}-${pad(m)}-01`, to: today, label: 'за этот месяц' };
  if (period === 'prev') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}`, label: 'за прошлый месяц' };
  }
  if (period === '3m') {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return { from: d.toISOString().slice(0, 10), to: today, label: 'за последние 3 месяца' };
  }
  return { from: null, to: null, label: 'за всё время' };
}

async function balanceOf(clientId: number) {
  const { rows } = await pool.query(
    `SELECT c.initial_debt + COALESCE(st.total, 0) + COALESCE(ap.total, 0) AS purchased,
            COALESCE(pt.total, 0) AS paid,
            c.initial_debt + COALESCE(st.total, 0) + COALESCE(ap.total, 0) - COALESCE(pt.total, 0) AS balance
     FROM clients c
     LEFT JOIN (SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s WHERE client_id IS NOT NULL GROUP BY client_id) st ON st.client_id = c.id
     LEFT JOIN (${CLIENT_ADJ_PLUS_SUBQUERY}) ap ON ap.client_id = c.id
     LEFT JOIN (${CLIENT_PAID_SUBQUERY}) pt ON pt.client_id = c.id
     WHERE c.id = $1`,
    [clientId],
  );
  return rows[0] as { purchased: string; paid: string; balance: string };
}

function balanceLine(balance: number): string {
  if (Math.abs(balance) < 1) return '✅ Задолженности нет.';
  return balance > 0 ? `Ваш долг: ${fmt(balance)} сум` : `Переплата: ${fmt(-balance)} сум (мы должны вам)`;
}

/** Делит длинный отчёт на сообщения до лимита Телеграма (4096 знаков). */
function splitLines(head: string, lines: string[]): string[] {
  const out: string[] = [];
  let cur = head;
  for (const line of lines) {
    if ((cur + '\n\n' + line).length > 3600) {
      out.push(cur);
      cur = line;
    } else {
      cur += (cur ? '\n\n' : '') + line;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function purchasesReport(clientId: number, period: string): Promise<{ messages: string[]; total: number }> {
  const { from, to, label } = periodRange(period);
  const { rows } = await pool.query(
    `SELECT s.date, s.sale_type, cm.name AS mark, s.packaging, s.tonnage, s.price_per_ton, s.freight_price_per_ton,
            s.vehicle_type, COALESCE(ov.number, s.machine_number) AS machine, s.total_sum
     FROM sales s
     LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id
     LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
     WHERE s.client_id = $1 AND ($2::date IS NULL OR s.date >= $2::date) AND ($3::date IS NULL OR s.date <= $3::date)
     ORDER BY s.date DESC, s.id DESC`,
    [clientId, from, to],
  );
  const { rows: adj } = await pool.query(
    `SELECT date, amount, comment FROM client_debt_adjustments
     WHERE client_id = $1 AND amount > 0 AND ($2::date IS NULL OR date >= $2::date) AND ($3::date IS NULL OR date <= $3::date)
     ORDER BY date DESC`,
    [clientId, from, to],
  );
  const items: { date: string; text: string; sum: number }[] = [];
  for (const r of rows) {
    const freight = r.vehicle_type !== 'CLIENT' && Number(r.freight_price_per_ton) > 0 ? Number(r.tonnage) * Number(r.freight_price_per_ton) : 0;
    const parts =
      r.sale_type === 'CEMENT'
        ? [`${dmy(r.date)} · Цемент ${r.mark ?? ''}${r.packaging ? ` (${PACKAGING[r.packaging] ?? r.packaging})` : ''}`, `${fmtT(r.tonnage)} т × ${fmt(r.price_per_ton)} сум`]
        : [`${dmy(r.date)} · Перевозка`, `${fmtT(r.tonnage)} т × ${fmt(r.freight_price_per_ton)} сум`];
    if (r.sale_type === 'CEMENT' && freight > 0) parts.push(`+ перевозка ${fmt(freight)} сум`);
    parts.push(`Сумма: ${fmt(r.total_sum)} сум${r.machine ? ` · машина ${r.machine}` : ''}`);
    items.push({ date: r.date, text: parts.join('\n'), sum: Number(r.total_sum) });
  }
  for (const a of adj) items.push({ date: a.date, text: `${dmy(a.date)} · Корректировка\nСумма: ${fmt(a.amount)} сум — ${a.comment}`, sum: Number(a.amount) });
  items.sort((a, b) => (a.date < b.date ? 1 : -1));

  const total = items.reduce((s, i) => s + i.sum, 0);
  if (items.length === 0) return { messages: [`🛒 Покупок ${label} нет.`], total: 0 };
  const shown = items.slice(0, MAX_ROWS);
  const note = items.length > MAX_ROWS ? `\n\nПоказаны последние ${MAX_ROWS} из ${items.length}. Выберите период короче, чтобы увидеть остальные.` : '';
  const messages = splitLines(`🛒 Покупки ${label}`, shown.map((i) => i.text));
  messages[messages.length - 1] += `${note}\n\nИтого куплено: ${fmt(total)} сум (${items.length})`;
  return { messages, total };
}

async function paymentsReport(clientId: number, period: string): Promise<{ messages: string[]; total: number }> {
  const { from, to, label } = periodRange(period);
  const range = `($2::date IS NULL OR date >= $2::date) AND ($3::date IS NULL OR date <= $3::date)`;
  const args = [clientId, from, to];
  const [cash, goods, adj, paidHim] = await Promise.all([
    pool.query(
      `SELECT date, amount, currency, usd_rate, extra_amount, payment_type, payer_name FROM cash_income
       WHERE client_id = $1 AND ${range} ORDER BY date DESC, id DESC`,
      args,
    ),
    pool.query(
      `SELECT date, tonnage, total_sum FROM incoming WHERE warehouse = 'CLIENT_GOODS' AND client_id = $1 AND ${range} ORDER BY date DESC`,
      args,
    ),
    pool.query(`SELECT date, amount, comment FROM client_debt_adjustments WHERE client_id = $1 AND amount < 0 AND ${range} ORDER BY date DESC`, args),
    pool.query(
      `SELECT date, amount, currency, usd_rate FROM cash_expense WHERE client_id = $1 AND category = 'контрагент' AND ${range} ORDER BY date DESC`,
      args,
    ),
  ]);
  const items: { date: string; text: string; sum: number }[] = [];
  for (const r of cash.rows) {
    const uzs = r.currency === 'USD' ? Number(r.amount) * Number(r.usd_rate ?? 0) : Number(r.amount);
    const extraUzs = r.extra_amount ? (r.currency === 'USD' ? Number(r.extra_amount) : Number(r.extra_amount) * Number(r.usd_rate ?? 0)) : 0;
    const sum = uzs + extraUzs;
    const shown = r.currency === 'USD' ? `$${fmt(r.amount)} (курс ${fmt(r.usd_rate)}) = ${fmt(sum)} сум` : `${fmt(sum)} сум`;
    items.push({ date: r.date, text: `${dmy(r.date)} · Оплата (${r.payment_type})\n${shown}${r.payer_name ? ` · платил: ${r.payer_name}` : ''}`, sum });
  }
  for (const g of goods.rows) items.push({ date: g.date, text: `${dmy(g.date)} · Оплата цементом\n${fmtT(g.tonnage)} т на ${fmt(g.total_sum)} сум`, sum: Number(g.total_sum) });
  for (const a of adj.rows) items.push({ date: a.date, text: `${dmy(a.date)} · Корректировка долга\n${fmt(-Number(a.amount))} сум — ${a.comment}`, sum: -Number(a.amount) });
  for (const p of paidHim.rows) {
    const uzs = p.currency === 'USD' ? Number(p.amount) * Number(p.usd_rate ?? 0) : Number(p.amount);
    items.push({ date: p.date, text: `${dmy(p.date)} · Мы выплатили вам\n${fmt(uzs)} сум`, sum: -uzs });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = items.reduce((s, i) => s + i.sum, 0);
  if (items.length === 0) return { messages: [`💵 Платежей ${label} нет.`], total: 0 };
  const shown = items.slice(0, MAX_ROWS);
  const note = items.length > MAX_ROWS ? `\n\nПоказаны последние ${MAX_ROWS} из ${items.length}. Выберите период короче.` : '';
  const messages = splitLines(`💵 Платежи ${label}`, shown.map((i) => i.text));
  messages[messages.length - 1] += `${note}\n\nИтого оплачено: ${fmt(total)} сум (${items.length})`;
  return { messages, total };
}

const BACK: Button[] = [{ text: '🏠 Меню', data: 'c:menu' }];

function periodButtons(kind: string): Button[][] {
  return [
    [
      { text: PERIOD_LABELS.month, data: `c:${kind}:month` },
      { text: PERIOD_LABELS.prev, data: `c:${kind}:prev` },
    ],
    [
      { text: PERIOD_LABELS['3m'], data: `c:${kind}:3m` },
      { text: PERIOD_LABELS.all, data: `c:${kind}:all` },
    ],
    BACK,
  ];
}

export async function handleClientUpdate(token: string, chatId: number, link: ClientLink, text: string, data: string): Promise<void> {
  const say = async (t: string, buttons?: Button[][]) => {
    await tg(token, 'sendMessage', { chat_id: chatId, text: t, ...(buttons ? { reply_markup: keyboard(buttons) } : {}) });
  };
  const menu = () =>
    say(`Здравствуйте, ${link.name}! Что показать?`, [
      [{ text: '💰 Мой баланс', data: 'c:bal' }],
      [
        { text: '🛒 Покупки', data: 'c:buy' },
        { text: '💵 Платежи', data: 'c:pay' },
      ],
      [{ text: '📊 Сверка за период', data: 'c:rec' }],
      [{ text: '📎 Выписка в Excel', data: 'c:xls' }],
    ]);

  if (!data.startsWith('c:')) {
    await menu();
    return;
  }
  const [, kind, period] = data.split(':');

  if (kind === 'menu') return menu();
  if (kind === 'bal') {
    const b = await balanceOf(link.client_id);
    await say(`💰 Баланс на сегодня\n\nКуплено всего: ${fmt(b.purchased)} сум\nОплачено всего: ${fmt(b.paid)} сум\n\n${balanceLine(Number(b.balance))}`, [BACK]);
    return;
  }
  if (!period) {
    await say(`За какой период ${kind === 'xls' ? 'сформировать выписку' : `показать ${kind === 'buy' ? 'покупки' : kind === 'pay' ? 'платежи' : 'сверку'}`}?`, periodButtons(kind));
    return;
  }
  if (kind === 'buy' || kind === 'pay') {
    const rep = kind === 'buy' ? await purchasesReport(link.client_id, period) : await paymentsReport(link.client_id, period);
    for (let i = 0; i < rep.messages.length; i++) await say(rep.messages[i], i === rep.messages.length - 1 ? [BACK] : undefined);
    return;
  }
  if (kind === 'xls') {
    const range = periodRange(period);
    await say('Формирую выписку…');
    try {
      const file = await buildClientWorkbook(link.client_id, link.name, range);
      const safe = link.name.replace(/[^\p{L}\p{N}]+/gu, '_');
      await sendDocument(token, chatId, `Выписка_${safe}_${PERIOD_LABELS[period] ?? 'период'}.xlsx`.replace(/\s+/g, '_'), file, `Выписка ${range.label}`);
      await say('Готово. Файл выше.', [BACK]);
    } catch (err) {
      console.error('client xls:', err instanceof Error ? err.message : err);
      await say('Не удалось сформировать выписку. Попробуйте позже.', [BACK]);
    }
    return;
  }
  if (kind === 'rec') {
    const [buy, pay, b] = await Promise.all([purchasesReport(link.client_id, period), paymentsReport(link.client_id, period), balanceOf(link.client_id)]);
    const { label } = periodRange(period);
    await say(
      `📊 Сверка ${label}\n\nКуплено: ${fmt(buy.total)} сум\nОплачено: ${fmt(pay.total)} сум\n\nНа сегодня: ${balanceLine(Number(b.balance))}`,
      [[{ text: '🛒 Покупки подробно', data: `c:buy:${period}` }, { text: '💵 Платежи подробно', data: `c:pay:${period}` }], BACK],
    );
    return;
  }
  await menu();
}
