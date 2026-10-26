import { pool } from '../../db/pool.js';
import { buildPayload, summaryOf, type Data } from './payload.js';
import { keyboard, tg, type Button } from './telegram.js';

/** Диалог менеджера с ботом: бот по очереди спрашивает те же поля, что и форма «Новая продажа», и
 * кладёт готовую заявку в sale_requests. Какое поле спрашивать следующим, определяет nextField():
 * так порядок вопросов сам подстраивается под уже введённые ответы (цемент/логистика, тип машины). */

interface State {
  data: Data;
  /** Человекочитаемые подписи выбранных значений — для итогового сообщения и карточки заявки. */
  names: Record<string, string>;
  /** Поле, ответ на которое бот сейчас ждёт. */
  awaiting?: string;
  /** Последнее сообщение бота с вопросом — его убираем, когда менеджер ответил, чтобы не засорять чат. */
  promptId?: number;
}


const FIELD_TITLES: Record<string, string> = {
  sale_type: 'Тип',
  client_id: 'Клиент',
  zavod_id: 'Поставщик',
  factory_id: 'Завод',
  cement_mark_id: 'Марка',
  packaging: 'Упаковка',
  tonnage: 'Тоннаж, т',
  price_per_ton: 'Цена за тонну, сум',
  sale_price_per_ton: 'Цена продажи клиенту за тонну, сум',
  vehicle_type: 'Машина',
  machine_number: 'Номер машины',
  own_vehicle_id: 'Своя машина',
  carrier_name: 'Перевозчик',
  freight_price_per_ton: 'Цена перевозки за тонну, сум',
  hire_price_per_ton: 'Цена найма за тонну, сум',
  comment: 'Комментарий',
};

function nextField(d: Data): string | null {
  if (!d.sale_type) return 'sale_type';
  if (!d.client_id) return 'client_id';
  if (d.sale_type === 'CEMENT' || d.sale_type === 'DIRECT') {
    const fields = ['zavod_id', 'factory_id', 'cement_mark_id', 'packaging', 'tonnage', 'price_per_ton'];
    if (d.sale_type === 'DIRECT') fields.push('sale_price_per_ton');
    for (const f of fields) {
      if (d[f] == null) return f;
    }
  } else if (d.tonnage == null) {
    return 'tonnage';
  }
  if (!d.vehicle_type) return 'vehicle_type';
  const vehicleFields =
    d.vehicle_type === 'CLIENT'
      ? ['machine_number']
      : d.vehicle_type === 'OWN'
        ? ['own_vehicle_id', 'freight_price_per_ton']
        : ['machine_number', 'carrier_name', 'freight_price_per_ton', 'hire_price_per_ton'];
  for (const f of vehicleFields) if (d[f] == null) return f;
  if (d.comment === undefined) return 'comment';
  return null;
}

const NUMBER_FIELDS = new Set(['tonnage', 'price_per_ton', 'sale_price_per_ton', 'freight_price_per_ton', 'hire_price_per_ton']);
const TEXT_FIELDS = new Set(['machine_number', 'carrier_name', 'comment']);

function parseNumber(text: string): number | null {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}


async function loadState(telegramId: number): Promise<State> {
  const { rows } = await pool.query('SELECT state FROM bot_sessions WHERE telegram_id = $1', [telegramId]);
  return (rows[0]?.state as State) ?? { data: {}, names: {} };
}

async function saveState(telegramId: number, state: State | null) {
  if (!state) {
    await pool.query('DELETE FROM bot_sessions WHERE telegram_id = $1', [telegramId]);
    return;
  }
  await pool.query(
    `INSERT INTO bot_sessions (telegram_id, state, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (telegram_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [telegramId, JSON.stringify(state)],
  );
}

interface Ctx {
  token: string;
  chatId: number;
  lastId: number;
  say: (text: string, buttons?: Button[][]) => Promise<void>;
}

const CANCEL_ROW: Button[] = [{ text: '✖ Отмена', data: 'cancel' }];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function optionButtons(field: string, table: string, labelCol: string): Promise<Button[][]> {
  const { rows } = await pool.query(`SELECT id, ${labelCol} AS label FROM ${table} WHERE active ORDER BY ${labelCol} LIMIT 60`);
  return chunk(
    rows.map((r) => ({ text: String(r.label), data: `s:${field}:${r.id}` })),
    2,
  );
}

async function ask(ctx: Ctx, telegramId: number, state: State) {
  const field = nextField(state.data);
  if (!field) {
    await showSummary(ctx, telegramId, state);
    return;
  }
  state.awaiting = field;
  await saveState(telegramId, state);
  const title = field === 'price_per_ton' && state.data.sale_type === 'DIRECT' ? 'Цена закупки у поставщика за тонну, сум' : FIELD_TITLES[field];

  if (field === 'sale_type') {
    await ctx.say('Что продаём?', [
      [
        { text: 'Цемент со склада', data: 's:sale_type:CEMENT' },
        { text: 'Напрямую', data: 's:sale_type:DIRECT' },
      ],
      [{ text: 'Логистика', data: 's:sale_type:LOGISTICS' }],
      CANCEL_ROW,
    ]);
  } else if (field === 'client_id') {
    const { rows } = await pool.query('SELECT id, name FROM clients ORDER BY name LIMIT 9');
    if (rows.length > 0 && rows.length <= 8) {
      await ctx.say('Выберите клиента (или напишите часть названия):', [
        ...chunk(rows.map((r) => ({ text: String(r.name), data: `s:client_id:${r.id}` })), 2),
        CANCEL_ROW,
      ]);
    } else {
      await ctx.say('Напишите часть названия клиента — я покажу подходящих.', [CANCEL_ROW]);
    }
  } else if (field === 'zavod_id') {
    await ctx.say('Выберите поставщика:', [...(await optionButtons(field, 'zavody', 'name')), CANCEL_ROW]);
  } else if (field === 'factory_id') {
    await ctx.say('Выберите завод:', [...(await optionButtons(field, 'factories', 'name')), CANCEL_ROW]);
  } else if (field === 'cement_mark_id') {
    await ctx.say('Выберите марку цемента:', [...(await optionButtons(field, 'cement_marks', 'name')), CANCEL_ROW]);
  } else if (field === 'packaging') {
    await ctx.say('Упаковка:', [
      [
        { text: 'Мешок', data: 's:packaging:MESHOK' },
        { text: 'Навал', data: 's:packaging:NAVAL' },
      ],
      CANCEL_ROW,
    ]);
  } else if (field === 'vehicle_type') {
    const opts: Button[] = [
      ...(state.data.sale_type !== 'LOGISTICS' ? [{ text: 'Машина клиента', data: 's:vehicle_type:CLIENT' }] : []),
      { text: 'Своя', data: 's:vehicle_type:OWN' },
      { text: 'Наёмная', data: 's:vehicle_type:HIRED' },
    ];
    await ctx.say('Какая машина?', [opts, CANCEL_ROW]);
  } else if (field === 'own_vehicle_id') {
    await ctx.say('Выберите свою машину:', [...(await optionButtons(field, 'machines', 'number')), CANCEL_ROW]);
  } else if (field === 'comment') {
    await ctx.say('Комментарий к заявке (можно пропустить):', [[{ text: 'Пропустить', data: 's:comment:' }], CANCEL_ROW]);
  } else if (NUMBER_FIELDS.has(field)) {
    await ctx.say(`${title}? Напишите число.`, [CANCEL_ROW]);
  } else {
    await ctx.say(`${title}? Напишите текстом.`, [CANCEL_ROW]);
  }
}

function summaryText(state: State): string {
  return summaryOf(state.data, state.names);
}

async function showSummary(ctx: Ctx, telegramId: number, state: State) {
  state.awaiting = 'confirm';
  await saveState(telegramId, state);
  await ctx.say(`Проверьте заявку:\n\n${summaryText(state)}`, [
    [
      { text: '✅ Отправить оператору', data: 'go' },
      { text: '✖ Отмена', data: 'cancel' },
    ],
  ]);
}

async function submit(ctx: Ctx, telegramId: number, manager: { id: number; name: string }, state: State) {
  const built = buildPayload(state.data, state.names.own_vehicle_id ?? null);
  if ('error' in built) {
    await ctx.say(`Заявка заполнена не полностью: ${built.error}. Начните заново: /start`);
    await saveState(telegramId, null);
    return;
  }
  const payload = built.payload;
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (manager_id, manager_name, payload, summary) VALUES ($1, $2, $3, $4) RETURNING id`,
    [manager.id, manager.name, JSON.stringify({ ...payload, _names: state.names }), summaryText(state)],
  );
  await saveState(telegramId, null);
  await ctx.say(`Заявка №${rows[0].id} отправлена оператору:\n\n${summaryText(state)}\n\nКогда её подтвердят, я напишу сюда.`, [
    [{ text: '➕ Ещё одна заявка', data: 'new' }],
  ]);
}

async function menu(ctx: Ctx, name: string) {
  await ctx.say(`Здравствуйте, ${name}! Что делаем?`, [
    [{ text: '➕ Новая заявка на продажу', data: 'new' }],
    [{ text: '📋 Мои заявки', data: 'mine' }],
  ]);
}

const STATUS_LABELS: Record<string, string> = { pending: '⏳ ждёт оператора', approved: '✅ подтверждена', rejected: '❌ отклонена' };

async function showMine(ctx: Ctx, managerId: number) {
  const { rows } = await pool.query(
    `SELECT id, status, summary, reject_reason FROM sale_requests WHERE manager_id = $1 ORDER BY id DESC LIMIT 5`,
    [managerId],
  );
  if (rows.length === 0) {
    await ctx.say('Заявок пока нет.', [[{ text: '➕ Новая заявка на продажу', data: 'new' }]]);
    return;
  }
  const text = rows
    .map((r) => `№${r.id} — ${STATUS_LABELS[r.status]}${r.reject_reason ? ` (${r.reject_reason})` : ''}\n${String(r.summary).split('\n').slice(1, 4).join(', ')}`)
    .join('\n\n');
  await ctx.say(text, [[{ text: '➕ Новая заявка на продажу', data: 'new' }]]);
}

/** Поиск клиента по части названия (регистр не важен; сравниваем в JS — независимо от локали базы). */
async function searchClients(query: string) {
  const { rows } = await pool.query('SELECT id, name FROM clients ORDER BY name');
  const q = query.trim().toLowerCase();
  return rows.filter((r) => String(r.name).toLowerCase().includes(q));
}

export interface IncomingUpdate {
  message?: { message_id?: number; chat: { id: number }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; text?: string; chat: { id: number } } };
}

export async function handleUpdate(token: string, update: IncomingUpdate): Promise<void> {
  const msg = update.message;
  const cb = update.callback_query;
  const telegramId = msg?.from?.id ?? cb?.from.id;
  const chatId = msg?.chat.id ?? cb?.message?.chat.id;
  if (!telegramId || !chatId) return;

  const ctx: Ctx = {
    token,
    chatId,
    lastId: 0,
    say: async (text, buttons) => {
      const sent = await tg<{ message_id: number }>(token, 'sendMessage', { chat_id: chatId, text, ...(buttons ? { reply_markup: keyboard(buttons) } : {}) });
      ctx.lastId = sent.message_id;
    },
  };
  try {
    await route(ctx, update, telegramId);
  } finally {
    // Запоминаем последний вопрос бота (если диалог идёт), чтобы убрать его после ответа.
    if (ctx.lastId) {
      await pool
        .query(`UPDATE bot_sessions SET state = jsonb_set(state, '{promptId}', to_jsonb($2::bigint)) WHERE telegram_id = $1`, [telegramId, ctx.lastId])
        .catch(() => undefined);
    }
  }
}

async function route(ctx: Ctx, update: IncomingUpdate, telegramId: number): Promise<void> {
  const { token, chatId } = ctx;
  const msg = update.message;
  const cb = update.callback_query;
  const del = (id?: number) =>
    id ? tg(token, 'deleteMessage', { chat_id: chatId, message_id: id }).then(() => undefined, () => undefined) : Promise.resolve();
  if (cb) await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id }).catch(() => undefined);

  const text = (msg?.text ?? '').trim();
  const data = cb?.data ?? '';

  // Уборка чата: после ответа менеджера убираем его текст и вопрос бота; после нажатия кнопки — сам вопрос с кнопками.
  const state = await loadState(telegramId);
  if (msg) {
    await del(msg.message_id);
    await del(state.promptId);
  }
  if (cb?.message) {
    const keepsText = !(data.startsWith('s:') || data === 'cancel' || data === 'go' || cb.message.text?.startsWith('Здравствуйте'));
    if (keepsText) {
      await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    } else {
      await del(cb.message.message_id);
    }
  }

  const { rows: found } = await pool.query('SELECT id, name FROM bot_managers WHERE telegram_id = $1 AND active', [telegramId]);
  const manager = found[0] as { id: number; name: string } | undefined;

  // Незнакомый человек: пускаем только по одноразовому коду, который выдал оператор в системе.
  if (!manager) {
    const code = text.replace(/^\/start\s*/i, '').trim().toUpperCase();
    if (code) {
      const { rows } = await pool.query(
        `UPDATE bot_managers SET telegram_id = $1, link_code = NULL WHERE link_code = $2 AND telegram_id IS NULL AND active RETURNING id, name`,
        [telegramId, code],
      );
      if (rows[0]) {
        await menu(ctx, rows[0].name);
        return;
      }
    }
    await ctx.say('Вы пока не подключены. Попросите оператора выдать код доступа и отправьте его сюда.');
    return;
  }

  if (/^\/(start|menu)/i.test(text) || data === 'cancel') {
    await saveState(telegramId, null);
    await menu(ctx, manager.name);
    return;
  }
  if (data === 'mine') return showMine(ctx, manager.id);
  if (data === 'new') {
    await ask(ctx, telegramId, { data: {}, names: {} });
    return;
  }

  if (data === 'go') {
    if (state.awaiting !== 'confirm') return menu(ctx, manager.name);
    return submit(ctx, telegramId, manager, state);
  }

  // Нажатие на кнопку выбора: s:<поле>:<значение>
  if (data.startsWith('s:')) {
    const [, field, ...rest] = data.split(':');
    const value = rest.join(':');
    if (field !== nextField(state.data)) {
      await ctx.say('Эта кнопка устарела. Продолжайте с последнего вопроса или нажмите /start.');
      return;
    }
    if (field === 'comment') {
      state.data.comment = null;
    } else if (['client_id', 'zavod_id', 'factory_id', 'cement_mark_id', 'own_vehicle_id'].includes(field)) {
      const table = { client_id: 'clients', zavod_id: 'zavody', factory_id: 'factories', cement_mark_id: 'cement_marks', own_vehicle_id: 'machines' }[field]!;
      const col = field === 'own_vehicle_id' ? 'number' : 'name';
      const { rows } = await pool.query(`SELECT id, ${col} AS label FROM ${table} WHERE id = $1`, [Number(value)]);
      if (!rows[0]) {
        await ctx.say('Не нашёл такой вариант, выберите заново.');
        return ask(ctx, telegramId, state);
      }
      state.data[field] = rows[0].id;
      state.names[field] = String(rows[0].label);
    } else {
      state.data[field] = value;
    }
    return ask(ctx, telegramId, state);
  }

  // Обычный текст — ответ на текущий вопрос.
  if (!text || !state.awaiting || state.awaiting === 'confirm') {
    await menu(ctx, manager.name);
    return;
  }
  const field = state.awaiting;
  if (field === 'client_id') {
    const matches = await searchClients(text);
    if (matches.length === 0) {
      await ctx.say('Такого клиента нет в системе. Попробуйте написать иначе или обратитесь к оператору.', [CANCEL_ROW]);
    } else if (matches.length > 8) {
      await ctx.say(`Найдено ${matches.length} клиентов — напишите название подлиннее.`, [CANCEL_ROW]);
    } else {
      await ctx.say('Выберите клиента:', [...chunk(matches.map((r) => ({ text: String(r.name), data: `s:client_id:${r.id}` })), 2), CANCEL_ROW]);
    }
    return;
  }
  if (NUMBER_FIELDS.has(field)) {
    const n = parseNumber(text);
    if (n === null) {
      await ctx.say('Нужно число больше нуля, например 25 или 650000.', [CANCEL_ROW]);
      return;
    }
    state.data[field] = n;
  } else if (TEXT_FIELDS.has(field)) {
    state.data[field] = field === 'machine_number' ? text.replace(/\s+/g, '').toUpperCase() : text;
  } else {
    await ctx.say('Выберите вариант кнопкой.', [CANCEL_ROW]);
    return;
  }
  return ask(ctx, telegramId, state);
}
