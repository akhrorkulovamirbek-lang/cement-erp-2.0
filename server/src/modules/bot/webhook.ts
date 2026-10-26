import { Router } from 'express';
import { runInTenant } from '../../db/tenant.js';
import { publicPool } from '../../db/tenant.js';
import { handleUpdate, type IncomingUpdate } from './flow.js';

/** Сюда Телеграм присылает сообщения менеджеров. Адрес содержит id организации и её секрет —
 * без верного секрета запрос игнорируется. Всегда отвечаем 200, иначе Телеграм будет слать повторно. */
export const botWebhookRouter = Router();

botWebhookRouter.post('/:orgId/:secret', async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const orgId = Number(req.params.orgId);
    if (!Number.isInteger(orgId)) return;
    const { rows } = await publicPool.query('SELECT bot_token, bot_secret FROM organizations WHERE id = $1 AND active', [orgId]);
    const org = rows[0];
    if (!org?.bot_token || org.bot_secret !== req.params.secret) return;
    await runInTenant(orgId, () => handleUpdate(org.bot_token, req.body as IncomingUpdate));
  } catch (err) {
    console.error('bot webhook:', err instanceof Error ? err.message : err);
  }
});
