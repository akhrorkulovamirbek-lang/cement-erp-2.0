import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';

export const clientAdjustmentsRouter = Router();

// amount > 0 — долг клиента вырос, amount < 0 — уменьшился. Причина обязательна, чтобы потом было
// понятно, откуда взялась правка; запись не редактируется — ошибочную удаляют и вносят заново.
const schema = z.object({
  client_id: z.coerce.number().int().positive('Выберите клиента'),
  date: z.string().min(1),
  amount: z.coerce.number().refine((v) => v !== 0, 'Сумма не должна быть нулём'),
  comment: z.string().trim().min(1, 'Укажите причину корректировки'),
});

clientAdjustmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params: unknown[] = [];
    let where = '';
    if (req.query.client_id) {
      params.push(Number(req.query.client_id));
      where = 'WHERE client_id = $1';
    }
    const { rows } = await pool.query(`SELECT * FROM client_debt_adjustments ${where} ORDER BY date DESC, id DESC`, params);
    res.json(rows);
  }),
);

clientAdjustmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO client_debt_adjustments (client_id, date, amount, comment) VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.client_id, data.date, data.amount, data.comment],
    );
    res.status(201).json(rows[0]);
  }),
);

clientAdjustmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM client_debt_adjustments WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Корректировка не найдена');
    res.status(204).end();
  }),
);
