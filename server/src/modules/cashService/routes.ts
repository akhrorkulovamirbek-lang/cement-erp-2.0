import { Router } from 'express';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { cashServiceSchema } from './schema.js';
import { createCashServiceOp, deleteCashServiceOp, updateCashServiceOp } from './service.js';

export const cashServiceRouter = Router();

cashServiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { bank_account_id, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (bank_account_id) {
      params.push(Number(bank_account_id));
      conditions.push(`cso.bank_account_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`cso.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`cso.date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT cso.*, ba.display_name AS bank_account_name
       FROM cash_service_operations cso
       JOIN bank_accounts ba ON ba.id = cso.bank_account_id
       ${where}
       ORDER BY cso.date DESC, cso.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

cashServiceRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const from = (req.query.from as string) || '1970-01-01';
    const to = (req.query.to as string) || '2999-12-31';
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0) AS commission_total,
              COALESCE(SUM(transfer_amount), 0) AS transfer_total,
              COUNT(*)::int AS count
       FROM cash_service_operations WHERE date BETWEEN $1 AND $2`,
      [from, to],
    );
    res.json({
      commissionTotal: Number(rows[0].commission_total),
      transferTotal: Number(rows[0].transfer_total),
      count: rows[0].count,
    });
  }),
);

cashServiceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = cashServiceSchema.parse(req.body);
    const row = await withTransaction((client) => createCashServiceOp(client, data));
    res.status(201).json(row);
  }),
);

cashServiceRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = cashServiceSchema.parse(req.body);
    const row = await withTransaction((client) => updateCashServiceOp(client, Number(req.params.id), data));
    res.json(row);
  }),
);

cashServiceRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction((client) => deleteCashServiceOp(client, Number(req.params.id)));
    res.status(204).end();
  }),
);
