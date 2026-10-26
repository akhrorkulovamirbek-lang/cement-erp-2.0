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
