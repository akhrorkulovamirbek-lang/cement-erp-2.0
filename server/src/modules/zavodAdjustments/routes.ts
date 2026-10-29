import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';

export const zavodAdjustmentsRouter = Router();

// amount > 0 — мы должны поставщику больше, amount < 0 — уменьшился. Причина обязательна, чтобы потом было
// понятно, откуда взялась правка; запись не редактируется — ошибочную удаляют и вносят заново.
const schema = z.object({
  zavod_id: z.coerce.number().int().positive('Выберите поставщика'),
  date: z.string().min(1),
  amount: z.coerce.number().refine((v) => v !== 0, 'Сумма не должна быть нулём'),
  comment: z.string().trim().min(1, 'Укажите причину корректировки'),
});

zavodAdjustmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params: unknown[] = [];
    let where = '';
    if (req.query.zavod_id) {
      params.push(Number(req.query.zavod_id));
      where = 'WHERE zavod_id = $1';
    }
    const { rows } = await pool.query(`SELECT * FROM zavod_debt_adjustments ${where} ORDER BY date DESC, id DESC`, params);
    res.json(rows);
  }),
);

zavodAdjustmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO zavod_debt_adjustments (zavod_id, date, amount, comment) VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.zavod_id, data.date, data.amount, data.comment],
    );
    res.status(201).json(rows[0]);
  }),
);

zavodAdjustmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM zavod_debt_adjustments WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Корректировка не найдена');
    res.status(204).end();
  }),
);
