import { publicPool } from '../../db/tenant.js';

/** Тонкая обёртка над Bot API Телеграма (обычный fetch, без библиотек). */
export async function tg<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(json.description || 'Ошибка Телеграма');
  return json.result;
}

export interface Button {
  text: string;
  data: string;
}

export function keyboard(rows: Button[][]) {
  return { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) };
}

export async function getOrgBot(orgId: number): Promise<{ token: string; secret: string } | null> {
  const { rows } = await publicPool.query('SELECT bot_token, bot_secret FROM organizations WHERE id = $1', [orgId]);
  const r = rows[0];
  return r?.bot_token ? { token: r.bot_token, secret: r.bot_secret } : null;
}

/** Сообщение менеджеру (например, «заявка подтверждена»). Сбой отправки не должен ломать основное действие. */
export async function notifyManager(orgId: number, telegramId: number | string | null, text: string): Promise<void> {
  if (!telegramId) return;
  try {
    const bot = await getOrgBot(orgId);
    if (!bot) return;
    await tg(bot.token, 'sendMessage', { chat_id: telegramId, text });
  } catch (err) {
    console.error('bot notify:', err instanceof Error ? err.message : err);
  }
}

/** Отправка файла в чат (multipart): Телеграм принимает документ до 50 МБ. */
export async function sendDocument(token: string, chatId: number, filename: string, data: Buffer, caption?: string): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([new Uint8Array(data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || 'Не удалось отправить файл');
}
