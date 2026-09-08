import { Router } from 'express';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { incomingSchema } from './schema.js';
import { createIncoming, deleteIncoming, updateIncoming } from './service.js';

export const incomingRouter = Router();

incomingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { zavod_id, cement_mark_id, from, to, q } = req.query;
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
    if (from) {
      params.push(from);
      conditions.push(`i.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`i.date <= $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`i.machine_number ILIKE $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT i.*, z.name AS zavod_name, cm.name AS cement_mark_name
       FROM incoming i
       JOIN zavody z ON z.id = i.zavod_id
       JOIN cement_marks cm ON cm.id = i.cement_mark_id
       ${where}
       ORDER BY i.date DESC, i.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

incomingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = incomingSchema.parse(req.body);
    const row = await withTransaction((client) => createIncoming(client, data));
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
