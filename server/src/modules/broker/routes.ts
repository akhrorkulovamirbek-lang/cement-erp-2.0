import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requirePermission } from '../../middleware/permission.js';
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

// Пополнение — это деньги, ушедшие из кассы на брокерский счёт: отдельной строкой расхода кассы
// (category='брокер') с тем же способом оплаты и валютой, на брокерский счёт зачисляется сумма в сумах.
const replenishSchema = z
  .object({
    date: z.string().min(1),
    amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    usd_rate: z.coerce.number().positive().optional().nullable(),
    payment_type: z.enum(['перечисление', 'наличка', 'карта']).default('перечисление'),
    description: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
  });

brokerRouter.post(
  '/replenish',
  // Пополнение — движение денег, строже, чем просмотр/покупка тикета (доступных через Приход).
  requirePermission('broker'),
  asyncHandler(async (req, res) => {
    const data = replenishSchema.parse(req.body);
    const amountUzs = data.currency === 'USD' ? data.amount * data.usd_rate! : data.amount;
    const op = await withTransaction(async (client) => {
      const created = await applyBrokerOperation(client, {
        date: data.date,
        type: 'replenish',
        amount: amountUzs,
        description: data.description ?? 'Пополнение счёта',
      });
      await client.query(
        `INSERT INTO cash_expense (date, category, amount, currency, usd_rate, payment_type, comment, related_broker_op_id)
         VALUES ($1,'брокер',$2,$3,$4,$5,$6,$7)`,
        [
          data.date,
          data.amount,
          data.currency,
          data.currency === 'USD' ? data.usd_rate : null,
          data.payment_type,
          data.description ?? 'Пополнение брокерского счёта',
          created.id,
        ],
      );
      return created;
    });
    res.status(201).json(op);
  }),
);
