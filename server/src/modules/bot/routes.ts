import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../../core/audit.js';
import { pool, withTransaction } from '../../db/pool.js';
import { publicPool } from '../../db/tenant.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/permission.js';
import { saleSchema } from '../sales/schema.js';
import { incomingSchema } from '../incoming/schema.js';
import { createIncoming } from '../incoming/service.js';
import { createSale } from '../sales/service.js';
import { buildPayload, summaryOf, type Data } from './payload.js';
import { notifySale } from './clientNotify.js';
import { notifyManager, tg } from './telegram.js';

export const botRouter = Router();

const orgIdOf = (req: { user?: { orgId: number | null } }) => {
  if (!req.user?.orgId) throw badRequest('Нет организации');
  return req.user.orgId;
};

// ---- Заявки (оператор: право «Продажи») ----

botRouter.get(
  '/requests',
  requirePermission('sales'),
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const { rows } = await pool.query(
      `SELECT * FROM sale_requests ${status ? 'WHERE status = $1' : ''} ORDER BY (status = 'pending') DESC, id DESC LIMIT 200`,
      status ? [status] : [],
    );
    res.json(rows);
  }),
);

// Заявка из мобильной формы «Быстрая заявка» (то же, что делает бот, только с экрана телефона).
botRouter.post(
  '/requests',
  requirePermission('sales'),
  asyncHandler(async (req, res) => {
    const d = req.body as Data;
    if (!['CEMENT', 'TICKET', 'DIRECT', 'LOGISTICS'].includes(String(d.sale_type))) throw badRequest('Выберите тип заявки');
    const names: Record<string, string> = {};
    const lookup = async (field: string, table: string, col: string) => {
      if (!d[field]) return;
      const { rows } = await pool.query(`SELECT ${col} AS label FROM ${table} WHERE id = $1`, [Number(d[field])]);
      if (rows[0]) names[field] = String(rows[0].label);
    };
    await Promise.all([
      lookup('client_id', 'clients', 'name'),
      lookup('zavod_id', 'zavody', 'name'),
      lookup('factory_id', 'factories', 'name'),
      lookup('cement_mark_id', 'cement_marks', 'name'),
      lookup('own_vehicle_id', 'machines', 'number'),
      lookup('ticket_id', 'tickets', 'ticket_number'),
    ]);
    const clean: Data = { ...d, machine_number: d.machine_number ? String(d.machine_number).replace(/\s+/g, '').toUpperCase() : null };
    const built = buildPayload(clean, names.own_vehicle_id ?? null);
    if ('error' in built) throw badRequest(built.error);
    const who = req.user!.username;
    const { rows: u } = await publicPool.query('SELECT full_name FROM users WHERE id = $1', [req.user!.userId]);
    const { rows } = await pool.query(
      `INSERT INTO sale_requests (manager_name, payload, summary) VALUES ($1, $2, $3) RETURNING id`,
      [u[0]?.full_name || who, JSON.stringify({ ...built.payload, _names: names }), summaryOf(clean, names)],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

botRouter.post(
  '/requests/:id/approve',
  requirePermission('sales'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM sale_requests WHERE id = $1 FOR UPDATE`, [id]);
      const request = rows[0];
      if (!request) throw notFound('Заявка не найдена');
      if (request.status !== 'pending') throw badRequest('Эта заявка уже обработана');
      // Данные могли устареть (например, клиента удалили) — проверяем по тем же правилам, что и обычную продажу.
      let sale: { id: number };
      if (request.payload.warehouse === 'DIRECT') {
        // Прямая продажа: приход «Напрямую» + привязанная продажа клиенту, которая ждёт погрузки.
        const incoming = await createIncoming(client, incomingSchema.parse(request.payload));
        await client.query('UPDATE sales SET awaiting_shipment = true WHERE id = $1', [incoming.linked_sale_id]);
        sale = { id: incoming.linked_sale_id };
      } else {
        sale = await createSale(client, saleSchema.parse({ ...request.payload, awaiting_shipment: true }));
      }
      await client.query(
        `UPDATE sale_requests SET status = 'approved', sale_id = $1, decided_by = $2, decided_at = now() WHERE id = $3`,
        [sale.id, req.user!.userId, id],
      );
      return { request, sale };
    });
    await recordAudit({
      userId: req.user!.userId,
      action: 'create',
      objectType: 'sale',
      objectId: result.sale.id,
      objectLabel: `Продажа из заявки бота №${id}`,
      req,
    });
    notifySale(result.sale.id);
    const { rows: m } = await pool.query('SELECT telegram_id FROM bot_managers WHERE id = $1', [result.request.manager_id]);
    await notifyManager(orgIdOf(req), m[0]?.telegram_id ?? null, `✅ Заявка №${id} подтверждена. Продажа ждёт погрузки.`);
    res.json({ ok: true, sale_id: result.sale.id });
  }),
);

botRouter.post(
  '/requests/:id/reject',
  requirePermission('sales'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().optional().default('') }).parse(req.body);
    const { rows } = await pool.query(
      `UPDATE sale_requests SET status = 'rejected', reject_reason = $1, decided_by = $2, decided_at = now()
       WHERE id = $3 AND status = 'pending' RETURNING manager_id`,
      [reason || null, req.user!.userId, id],
    );
    if (!rows[0]) throw badRequest('Заявка не найдена или уже обработана');
    const { rows: m } = await pool.query('SELECT telegram_id FROM bot_managers WHERE id = $1', [rows[0].manager_id]);
    await notifyManager(orgIdOf(req), m[0]?.telegram_id ?? null, `❌ Заявка №${id} отклонена${reason ? `: ${reason}` : '.'}`);
    res.json({ ok: true });
  }),
);

// ---- Настройка бота и менеджеры (право «Настройки») ----

botRouter.get(
  '/config',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    const { rows } = await publicPool.query('SELECT bot_token, bot_username FROM organizations WHERE id = $1', [orgIdOf(req)]);
    res.json({ connected: Boolean(rows[0]?.bot_token), username: rows[0]?.bot_username ?? null });
  }),
);

botRouter.put(
  '/config',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    const orgId = orgIdOf(req);
    const { token } = z.object({ token: z.string().trim().min(10, 'Вставьте ключ бота от BotFather') }).parse(req.body);
    let username: string;
    try {
      const me = await tg<{ username: string }>(token, 'getMe');
      username = me.username;
    } catch {
      throw badRequest('Телеграм не принял этот ключ. Скопируйте его от @BotFather целиком.');
    }
    const secret = crypto.randomBytes(16).toString('hex');
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    try {
      await tg(token, 'setWebhook', { url: `${base}/api/bot/webhook/${orgId}/${secret}`, allowed_updates: ['message', 'callback_query'] });
    } catch (err) {
      throw badRequest(`Не удалось подключить бота: ${err instanceof Error ? err.message : 'ошибка Телеграма'}`);
    }
    await publicPool.query('UPDATE organizations SET bot_token = $1, bot_secret = $2, bot_username = $3 WHERE id = $4', [token, secret, username, orgId]);
    res.json({ connected: true, username });
  }),
);

botRouter.delete(
  '/config',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    const orgId = orgIdOf(req);
    const { rows } = await publicPool.query('SELECT bot_token FROM organizations WHERE id = $1', [orgId]);
    if (rows[0]?.bot_token) await tg(rows[0].bot_token, 'deleteWebhook').catch(() => undefined);
    await publicPool.query('UPDATE organizations SET bot_token = NULL, bot_secret = NULL, bot_username = NULL WHERE id = $1', [orgId]);
    res.status(204).end();
  }),
);

botRouter.get(
  '/managers',
  requirePermission('settings'),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT id, name, link_code, telegram_id IS NOT NULL AS linked, active FROM bot_managers ORDER BY id');
    res.json(rows);
  }),
);

botRouter.post(
  '/managers',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1, 'Укажите имя менеджера') }).parse(req.body);
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { rows } = await pool.query('INSERT INTO bot_managers (name, link_code) VALUES ($1, $2) RETURNING id, name, link_code', [name, code]);
    res.status(201).json(rows[0]);
  }),
);

botRouter.delete(
  '/managers/:id',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM bot_managers WHERE id = $1', [Number(req.params.id)]);
    res.status(204).end();
  }),
);

// ---- Клиенты бота: у каждого клиента свой постоянный код ----

botRouter.get(
  '/client-links',
  requirePermission('settings'),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id AS client_id, c.name AS client_name, c.bot_code,
              (SELECT COUNT(*)::int FROM bot_client_links l WHERE l.client_id = c.id AND l.telegram_id IS NOT NULL) AS linked_count
       FROM clients c ORDER BY c.name`,
    );
    res.json(rows);
  }),
);

// Новый код: старый перестаёт работать для новых подключений (уже подключённые остаются).
botRouter.post(
  '/client-links/:clientId/regenerate',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const { rows } = await pool.query('UPDATE clients SET bot_code = $1 WHERE id = $2 RETURNING bot_code', [code, Number(req.params.clientId)]);
    if (!rows[0]) throw notFound('Клиент не найден');
    res.json(rows[0]);
  }),
);

// Отключить всех, кто подключился от имени этого клиента.
botRouter.delete(
  '/client-links/:clientId/people',
  requirePermission('settings'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM bot_client_links WHERE client_id = $1', [Number(req.params.clientId)]);
    res.status(204).end();
  }),
);
