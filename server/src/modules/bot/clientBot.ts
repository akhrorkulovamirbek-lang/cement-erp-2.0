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


export const fmt = (v: unknown) => Math.round(Number(v)).toLocaleString('ru-RU');

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

export async function balanceOf(clientId: number) {
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

export function balanceLine(balance: number): string {
  if (Math.abs(balance) < 1) return '✅ Задолженности нет.';
  return balance > 0 ? `Ваш долг: ${fmt(balance)} сум` : `Переплата: ${fmt(-balance)} сум (мы должны вам)`;
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
  if (kind === 'xls' && !period) {
    await say('За какой период сформировать выписку?', periodButtons('xls'));
    return;
  }
  if (kind === 'xls') {
    const range = periodRange(period);
    await say('Формирую выписку…');
    try {
      const { file, purchased, paid, debt } = await buildClientWorkbook(link.client_id, link.name, range);
      const safe = link.name.replace(/[^\p{L}\p{N}]+/gu, '_');
      const caption = `Выписка ${range.label}\nКуплено: ${fmt(purchased)} сум\nОплачено: ${fmt(paid)} сум\n${balanceLine(debt)}`;
      await sendDocument(token, chatId, `Выписка_${safe}_${PERIOD_LABELS[period] ?? 'период'}.xlsx`.replace(/\s+/g, '_'), file, caption);
      await say('Готово. Файл выше.', [BACK]);
    } catch (err) {
      console.error('client xls:', err instanceof Error ? err.message : err);
      await say('Не удалось сформировать выписку. Попробуйте позже.', [BACK]);
    }
    return;
  }
  await menu();
}
