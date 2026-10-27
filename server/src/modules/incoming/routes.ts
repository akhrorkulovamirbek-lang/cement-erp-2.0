import { Router } from 'express';
import { notifyGoodsPayment, notifySale } from '../bot/clientNotify.js';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { incomingSchema } from './schema.js';
import { createIncoming, deleteIncoming, updateIncoming } from './service.js';

export const incomingRouter = Router();

incomingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { zavod_id, cement_mark_id, client_id, from, to, q } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (zavod_id) {
      params.push(Number(zavod_id));
      conditions.push(`i.zavod_id = $${params.length}`);
    }
    if (cement_mark_id) {
      params.push(Number(cement_mark_id));
      conditions.push(`i.cement_mark_id = $${params.length}`);
    }
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`i.client_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`i.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`i.date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT i.*, z.name AS zavod_name, cm.name AS cement_mark_name, c.name AS client_name, f.name AS factory_name,
              -- Машина: номер из самого прихода, а у прямой продажи — машина, на которой цемент поехал клиенту.
              COALESCE(NULLIF(i.machine_number, ''), COALESCE(ov.number, ls.machine_number)) AS machine_display
       FROM incoming i
       LEFT JOIN sales ls ON ls.id = i.linked_sale_id
       LEFT JOIN machines ov ON ov.id = ls.own_vehicle_id
       LEFT JOIN factories f ON f.id = i.factory_id
       JOIN zavody z ON z.id = i.zavod_id
       JOIN cement_marks cm ON cm.id = i.cement_mark_id
       LEFT JOIN clients c ON c.id = i.client_id
       ${where}
       ORDER BY i.date DESC, i.id DESC`,
      params,
    );
    if (q) {
      // Регистр и пробелы сравниваем в JS — так поиск не зависит от настроек локали базы.
      const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
      const needle = norm(q);
      res.json(rows.filter((r) => norm(r.machine_display).includes(needle)));
      return;
    }
    res.json(rows);
  }),
);

incomingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = incomingSchema.parse(req.body);
    const row = await withTransaction((client) => createIncoming(client, data));
    // Прямая продажа создаёт продажу клиенту; оплата цементом — оплату от клиента.
    notifySale(row.linked_sale_id);
    notifyGoodsPayment(row.id);
    res.status(201).json(row);
  }),
);

incomingRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = incomingSchema.parse(req.body);
    const row = await withTransaction((client) => updateIncoming(client, Number(req.params.id), data));
    res.json(row);
  }),
);

incomingRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction((client) => deleteIncoming(client, Number(req.params.id)));
    res.status(204).end();
  }),
);
