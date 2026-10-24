import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { CARRIER_BALANCES_SQL } from '../../lib/carrierBalances.js';
import { conflict, notFound } from '../../lib/errors.js';
import { ensureLogist } from '../logists/service.js';
import { cashExpenseSchema, cashIncomeSchema } from './schema.js';

/** Расход с category='обналичивание' создаётся модулем Обналичивания (см.
 * cashService/service.ts) и правится/удаляется только оттуда — тот же 409-guard, что уже есть
 * у sales.source='direct' в sales/service.ts's assertEditable. */
async function assertNotLinkedToCashService(id: string) {
  const { rows } = await pool.query('SELECT 1 FROM cash_service_operations WHERE related_cash_expense_id = $1', [id]);
  if (rows[0]) {
    throw conflict('Эта выдача связана с обналичиванием — редактируйте и удаляйте её через раздел «Обналичивание»');
  }
  const { rows: broker } = await pool.query('SELECT 1 FROM cash_expense WHERE id = $1 AND related_broker_op_id IS NOT NULL', [id]);
  if (broker[0]) {
    throw conflict('Эта запись — пополнение брокерского счёта, её нельзя менять или удалять отсюда');
  }
}

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

// Возврат тикета на кассе — только информационные строки (деньги вернулись на брокерский счёт, а
// не в кассу, остатки кассы они не меняют).
cashIncomeRouter.get(
  '/ticket-returns',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const params: unknown[] = [];
    const conditions = [`bo.type = 'ticket_return'`];
    if (from) {
      params.push(from);
      conditions.push(`bo.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`bo.date <= $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT bo.id, bo.date, bo.amount, bo.description, t.ticket_number
       FROM broker_operations bo
       LEFT JOIN tickets t ON t.id = bo.related_ticket_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bo.date DESC, bo.id DESC`,
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
      `INSERT INTO cash_income (date, category, client_id, amount, currency, usd_rate, payment_type, comment, related_sale_id, payer_name, extra_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
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
        data.payer_name ?? null,
        data.extra_amount ?? null,
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
         payment_type=$7, comment=$8, related_sale_id=$9, payer_name=$10, extra_amount=$11
       WHERE id=$12 RETURNING *`,
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
        data.payer_name ?? null,
        data.extra_amount ?? null,
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
    const { zavod_id, client_id, category, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`ce.client_id = $${params.length}`);
    }
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
      `SELECT ce.*, z.name AS zavod_name, c.name AS client_name
       FROM cash_expense ce
       LEFT JOIN zavody z ON z.id = ce.zavod_id
       LEFT JOIN clients c ON c.id = ce.client_id
       ${where}
       ORDER BY ce.date DESC, ce.id DESC`,
      params,
    );
    res.json(rows);
  }),
);

// Раздел 3/6 ТЗ: долг перевозчику = Σ(tonnage*hire_price_per_ton) по наёмным рейсам минус то,
// что ему уже выплачено через кассу (category='перевозчик', то же имя). Перевозчик — не
// справочник (см. sales.carrier_name), поэтому группируем по имени, а не по id.
cashExpenseRouter.get(
  '/carrier-balances',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`SELECT name, owed, paid, balance FROM (${CARRIER_BALANCES_SQL}) c WHERE balance <> 0 ORDER BY balance DESC`);
    res.json(rows);
  }),
);

cashExpenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = cashExpenseSchema.parse(req.body);
    if (data.category === 'перевозчик') await ensureLogist(pool, data.carrier_name);
    const { rows } = await pool.query(
      `INSERT INTO cash_expense (date, category, machine_number, zavod_id, carrier_name, expense_type, amount, currency, usd_rate, payment_type, comment, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        data.date,
        data.category,
        data.machine_number ?? null,
        data.zavod_id ?? null,
        data.carrier_name ?? null,
        data.expense_type ?? null,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
        data.category === 'контрагент' ? (data.client_id ?? null) : null,
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

cashExpenseRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertNotLinkedToCashService(req.params.id);
    const data = cashExpenseSchema.parse(req.body);
    if (data.category === 'перевозчик') await ensureLogist(pool, data.carrier_name);
    const { rows } = await pool.query(
      `UPDATE cash_expense SET date=$1, category=$2, machine_number=$3, zavod_id=$4, carrier_name=$5, expense_type=$6,
         amount=$7, currency=$8, usd_rate=$9, payment_type=$10, comment=$11, client_id=$12
       WHERE id=$13 RETURNING *`,
      [
        data.date,
        data.category,
        data.machine_number ?? null,
        data.zavod_id ?? null,
        data.carrier_name ?? null,
        data.expense_type ?? null,
        data.amount,
        data.currency,
        data.usd_rate ?? null,
        data.payment_type,
        data.comment ?? null,
        data.category === 'контрагент' ? (data.client_id ?? null) : null,
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
    await assertNotLinkedToCashService(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM cash_expense WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Операция не найдена');
    res.status(204).end();
  }),
);
