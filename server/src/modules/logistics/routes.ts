import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';
import { logisticsSchema } from './schema.js';

export const logisticsRouter = Router();

logisticsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`l.client_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`l.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`l.date <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT l.*, c.name AS client_name
       FROM logistics l
       LEFT JOIN clients c ON c.id = l.client_id
       ${where}
       ORDER BY l.date DESC, l.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

logisticsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = logisticsSchema.parse(req.body);
    const totalSum = data.tonnage * data.price_per_ton;
    const { rows } = await pool.query(
      `INSERT INTO logistics (date, machine_number, machine_own, tonnage, price_per_ton, total_sum, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.date, data.machine_number, data.machine_own, data.tonnage, data.price_per_ton, totalSum, data.client_id ?? null],
    );
    res.status(201).json(rows[0]);
  }),
);

logisticsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = logisticsSchema.parse(req.body);
    const totalSum = data.tonnage * data.price_per_ton;
    const { rows } = await pool.query(
      `UPDATE logistics SET date=$1, machine_number=$2, machine_own=$3, tonnage=$4, price_per_ton=$5, total_sum=$6, client_id=$7
       WHERE id=$8 RETURNING *`,
      [data.date, data.machine_number, data.machine_own, data.tonnage, data.price_per_ton, totalSum, data.client_id ?? null, req.params.id],
    );
    if (!rows[0]) throw notFound('Услуга логистики не найдена');
    res.json(rows[0]);
  }),
);

logisticsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM logistics WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Услуга логистики не найдена');
    res.status(204).end();
  }),
);
