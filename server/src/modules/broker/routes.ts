import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { applyBrokerOperation } from './service.js';

export const brokerRouter = Router();

brokerRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const account = await pool.query('SELECT * FROM broker_account WHERE id = 1');
    const operations = await pool.query('SELECT * FROM broker_operations ORDER BY date DESC, id DESC');
    res.json({ account: account.rows[0], operations: operations.rows });
  }),
);

const replenishSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
  description: z.string().trim().optional(),
});

brokerRouter.post(
  '/replenish',
  asyncHandler(async (req, res) => {
    const data = replenishSchema.parse(req.body);
    const op = await withTransaction((client) =>
      applyBrokerOperation(client, {
        date: data.date,
        type: 'replenish',
        amount: data.amount,
        description: data.description ?? 'Пополнение счёта',
      }),
    );
    res.status(201).json(op);
  }),
);
