import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '../../core/settingsCache.js';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { CARRIER_BALANCES_SQL } from '../../lib/carrierBalances.js';
import { conflict, notFound } from '../../lib/errors.js';

export const logistsRouter = Router();

// Менять справочник логистов может только тот, у кого есть доступ к справочникам.
logistsRouter.use((req, res, next) => {
  if (req.method !== 'GET' && !hasPermission(req.user!.role, 'references')) {
    res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    return;
  }
  next();
});

const normalizePlate = (v: string) => v.replace(/\s+/g, '').toUpperCase();

const logistSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя или название логиста'),
  phone: z.string().trim().optional().nullable().default(null),
  comment: z.string().trim().optional().nullable().default(null),
  initial_debt: z.coerce.number().default(0),
  active: z.coerce.boolean().default(true),
});

const isUnique = (err: unknown) => (err as { code?: string }).code === '23505';

// Список логистов: баланс (по тем же правилам, что в отчёте «Перевозчики») и их машины.
logistsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT l.*, COALESCE(b.owed, 0) AS owed, COALESCE(b.paid, 0) AS paid, COALESCE(b.balance, 0) AS balance,
              COALESCE((SELECT json_agg(m.number ORDER BY m.number) FROM logist_machines m WHERE m.logist_id = l.id), '[]'::json) AS machines
       FROM logists l
       LEFT JOIN (${CARRIER_BALANCES_SQL}) b ON b.logist_id = l.id
       ORDER BY l.name`,
    );
    res.json(rows);
  }),
);

// Чей это номер: нужно формам продажи/кассы, чтобы подставить логиста по машине.
logistsRouter.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.id, l.name FROM logist_machines m JOIN logists l ON l.id = m.logist_id WHERE m.number = $1`,
      [normalizePlate(String(req.query.plate ?? ''))],
    );
    res.json(rows[0] ?? null);
  }),
);

logistsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = logistSchema.parse(req.body);
    try {
      const { rows } = await pool.query(
        'INSERT INTO logists (name, phone, comment, initial_debt, active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [d.name, d.phone, d.comment, d.initial_debt, d.active],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUnique(err)) throw conflict('Логист с таким именем уже есть');
      throw err;
    }
  }),
);

// Переименование обновляет имя и в рейсах/выплатах — иначе они потеряли бы связь с логистом.
logistsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = logistSchema.parse(req.body);
    try {
      const row = await withTransaction(async (client) => {
        const { rows: before } = await client.query('SELECT name FROM logists WHERE id = $1 FOR UPDATE', [id]);
        if (!before[0]) throw notFound('Логист не найден');
        const { rows } = await client.query(
          'UPDATE logists SET name=$1, phone=$2, comment=$3, initial_debt=$4, active=$5 WHERE id=$6 RETURNING *',
          [d.name, d.phone, d.comment, d.initial_debt, d.active, id],
        );
        if (before[0].name !== d.name) {
          await client.query(`UPDATE sales SET carrier_name = $1 WHERE norm_name(carrier_name) = norm_name($2)`, [d.name, before[0].name]);
          await client.query(`UPDATE cash_expense SET carrier_name = $1 WHERE norm_name(carrier_name) = norm_name($2)`, [d.name, before[0].name]);
        }
        return rows[0];
      });
      res.json(row);
    } catch (err) {
      if (isUnique(err)) throw conflict('Логист с таким именем уже есть');
      throw err;
    }
  }),
);

// Удалить можно только логиста без рейсов и выплат; иначе — отключить (active=false), история остаётся.
logistsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows } = await pool.query('SELECT name FROM logists WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('Логист не найден');
    const { rows: used } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM sales WHERE norm_name(carrier_name) = norm_name($1))
            + (SELECT COUNT(*) FROM cash_expense WHERE norm_name(carrier_name) = norm_name($1)) AS n`,
      [rows[0].name],
    );
    if (Number(used[0].n) > 0) throw conflict('У логиста есть рейсы или выплаты — удалить нельзя, снимите галочку «Активен»');
    await pool.query('DELETE FROM logists WHERE id = $1', [id]);
    res.status(204).end();
  }),
);

// Карточка логиста: машины, рейсы (по имени и по номерам его машин), выплаты, корректировки, итоги.
logistsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: lr } = await pool.query('SELECT * FROM logists WHERE id = $1', [id]);
    const logist = lr[0];
    if (!logist) throw notFound('Логист не найден');

    const [machines, trips, payments, adjustments, balance] = await Promise.all([
      pool.query('SELECT * FROM logist_machines WHERE logist_id = $1 ORDER BY number', [id]),
      pool.query(
        `SELECT s.id, s.date, s.sale_type, s.machine_number, s.tonnage, s.hire_price_per_ton, s.freight_price_per_ton,
                s.route, s.awaiting_shipment, c.name AS client_name,
                s.tonnage * COALESCE(s.hire_price_per_ton, 0) AS hire_total
         FROM sales s LEFT JOIN clients c ON c.id = s.client_id
         WHERE s.vehicle_type = 'HIRED' AND norm_name(s.carrier_name) = norm_name($1)
         ORDER BY s.date DESC, s.id DESC`,
        [logist.name],
      ),
      pool.query(
        `SELECT id, date, amount, currency, usd_rate, payment_type, comment,
                CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END AS amount_uzs
         FROM cash_expense
         WHERE category = 'перевозчик' AND norm_name(carrier_name) = norm_name($1)
         ORDER BY date DESC, id DESC`,
        [logist.name],
      ),
      pool.query('SELECT * FROM logist_debt_adjustments WHERE logist_id = $1 ORDER BY date DESC, id DESC', [id]),
      pool.query(`SELECT owed, paid, balance FROM (${CARRIER_BALANCES_SQL}) b WHERE b.logist_id = $1`, [id]),
    ]);

    res.json({
      logist,
      machines: machines.rows,
      trips: trips.rows,
      payments: payments.rows,
      adjustments: adjustments.rows,
      summary: balance.rows[0] ?? { owed: '0', paid: '0', balance: '0' },
    });
  }),
);

const machineSchema = z.object({
  number: z.string().trim().min(1, 'Укажите госномер').transform(normalizePlate),
  model: z.string().trim().optional().nullable().default(null),
  driver: z.string().trim().optional().nullable().default(null),
});

logistsRouter.post(
  '/:id/machines',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = machineSchema.parse(req.body);
    const { rows: exists } = await pool.query('SELECT 1 FROM logists WHERE id = $1', [id]);
    if (!exists[0]) throw notFound('Логист не найден');
    try {
      const { rows } = await pool.query(
        'INSERT INTO logist_machines (logist_id, number, model, driver) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, d.number, d.model, d.driver],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUnique(err)) throw conflict('Эта машина уже записана за логистом');
      throw err;
    }
  }),
);

logistsRouter.delete(
  '/machines/:machineId',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM logist_machines WHERE id = $1', [Number(req.params.machineId)]);
    if (!rowCount) throw notFound('Машина не найдена');
    res.status(204).end();
  }),
);

const adjustmentSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().refine((v) => v !== 0, 'Сумма не должна быть нулём'),
  comment: z.string().trim().min(1, 'Укажите причину корректировки'),
});

logistsRouter.post(
  '/:id/adjustments',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = adjustmentSchema.parse(req.body);
    const { rows: exists } = await pool.query('SELECT 1 FROM logists WHERE id = $1', [id]);
    if (!exists[0]) throw notFound('Логист не найден');
    const { rows } = await pool.query(
      'INSERT INTO logist_debt_adjustments (logist_id, date, amount, comment) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, d.date, d.amount, d.comment],
    );
    res.status(201).json(rows[0]);
  }),
);

logistsRouter.delete(
  '/adjustments/:adjId',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM logist_debt_adjustments WHERE id = $1', [Number(req.params.adjId)]);
    if (!rowCount) throw notFound('Корректировка не найдена');
    res.status(204).end();
  }),
);
