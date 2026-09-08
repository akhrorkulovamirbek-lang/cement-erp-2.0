import { Router } from 'express';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { saleSchema } from './schema.js';
import { createSale, deleteSale, updateSale } from './service.js';

export const salesRouter = Router();

salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, cement_mark_id, from, to, source } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`s.client_id = $${params.length}`);
    }
    if (cement_mark_id) {
      params.push(Number(cement_mark_id));
      conditions.push(`s.cement_mark_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`s.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`s.date <= $${params.length}`);
    }
    if (source) {
      params.push(source);
      conditions.push(`s.source = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS client_name, cm.name AS cement_mark_name, t.ticket_number
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       JOIN cement_marks cm ON cm.id = s.cement_mark_id
       LEFT JOIN tickets t ON t.id = s.ticket_id
       ${where}
       ORDER BY s.date DESC, s.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

salesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = saleSchema.parse(req.body);
    const row = await withTransaction((client) => createSale(client, data));
    res.status(201).json(row);
  }),
);

salesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = saleSchema.parse(req.body);
    const row = await withTransaction((client) => updateSale(client, Number(req.params.id), data));
    res.json(row);
  }),
);

salesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction((client) => deleteSale(client, Number(req.params.id)));
    res.status(204).end();
  }),
);
