import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';
import { cashExpenseSchema, cashIncomeSchema } from './schema.js';

export const cashIncomeRouter = Router();

cashIncomeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, category, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`ci.client_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`ci.category = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`ci.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ci.date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ci.*, c.name AS client_name
       FROM cash_income ci
       LEFT JOIN clients c ON c.id = ci.client_id
       ${where}
       ORDER BY ci.date DESC, ci.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

cashIncomeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = cashIncomeSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO cash_income (date, category, client_id, amount, currency, usd_rate, payment_type, comment, related_sale_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        data.date,
        data.category,
        data.client_id ?? null,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
        data.related_sale_id ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

cashIncomeRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = cashIncomeSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE cash_income SET date=$1, category=$2, client_id=$3, amount=$4, currency=$5, usd_rate=$6,
         payment_type=$7, comment=$8, related_sale_id=$9
       WHERE id=$10 RETURNING *`,
      [
        data.date,
        data.category,
        data.client_id ?? null,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
        data.related_sale_id ?? null,
        req.params.id,
      ],
    );
    if (!rows[0]) throw notFound('Операция не найдена');
    res.json(rows[0]);
  }),
);

cashIncomeRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM cash_income WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Операция не найдена');
    res.status(204).end();
  }),
);

export const cashExpenseRouter = Router();

cashExpenseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { zavod_id, category, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (zavod_id) {
      params.push(Number(zavod_id));
      conditions.push(`ce.zavod_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`ce.category = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`ce.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ce.date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ce.*, z.name AS zavod_name
       FROM cash_expense ce
       LEFT JOIN zavody z ON z.id = ce.zavod_id
       ${where}
       ORDER BY ce.date DESC, ce.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

cashExpenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = cashExpenseSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO cash_expense (date, category, machine_number, zavod_id, expense_type, amount, currency, usd_rate, payment_type, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.date,
        data.category,
        data.machine_number ?? null,
        data.zavod_id ?? null,
        data.expense_type,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

cashExpenseRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = cashExpenseSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE cash_expense SET date=$1, category=$2, machine_number=$3, zavod_id=$4, expense_type=$5, amount=$6,
         currency=$7, usd_rate=$8, payment_type=$9, comment=$10
       WHERE id=$11 RETURNING *`,
      [
        data.date,
        data.category,
        data.machine_number ?? null,
        data.zavod_id ?? null,
        data.expense_type,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
        req.params.id,
      ],
    );
    if (!rows[0]) throw notFound('Операция не найдена');
    res.json(rows[0]);
  }),
);

cashExpenseRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM cash_expense WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Операция не найдена');
    res.status(204).end();
  }),
);
