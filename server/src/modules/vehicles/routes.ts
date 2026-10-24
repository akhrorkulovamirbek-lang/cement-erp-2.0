import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const vehiclesRouter = Router();

const normalize = (v: string) => v.replace(/\s+/g, '').toUpperCase();

// История одной машины по госномеру: рейсы (продажи, где она возила) и расходы кассы на неё.
// Работает и для своих машин, и для наёмных — связь по номеру, как и в отчёте «Логистика».
vehiclesRouter.get(
  '/:number/history',
  asyncHandler(async (req, res) => {
    const number = normalize(String(req.params.number));

    const [machine, trips, expenses] = await Promise.all([
      pool.query('SELECT id, number, model, driver, capacity_tons, active FROM machines WHERE number = $1', [number]),
      pool.query(
        `SELECT s.id, s.date, s.sale_type, s.vehicle_type, s.tonnage, s.freight_price_per_ton, s.hire_price_per_ton,
                s.carrier_name, s.route, s.total_sum, s.awaiting_shipment, c.name AS client_name,
                z.name AS zavod_name, cm.name AS cement_mark_name
         FROM sales s
         LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN zavody z ON z.id = s.zavod_id
         LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id
         WHERE replace(upper(coalesce(s.machine_number, '')), ' ', '') = $1 OR ov.number = $1
         ORDER BY s.date DESC, s.id DESC`,
        [number],
      ),
      pool.query(
        `SELECT id, date, category, expense_type, amount, currency, usd_rate, payment_type, comment,
                CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END AS amount_uzs
         FROM cash_expense
         WHERE replace(upper(coalesce(machine_number, '')), ' ', '') = $1
         ORDER BY date DESC, id DESC`,
        [number],
      ),
    ]);

    const sum = (rows: Record<string, unknown>[], f: (r: Record<string, unknown>) => number) => rows.reduce((s, r) => s + f(r), 0);
    // Принесла — перевозка за клиента (кроме машин клиента, где её нет); наём — что платим наёмному перевозчику.
    const revenue = sum(trips.rows, (r) => (r.vehicle_type === 'CLIENT' ? 0 : Number(r.freight_price_per_ton ?? 0) * Number(r.tonnage)));
    const hireCost = sum(trips.rows, (r) => (r.vehicle_type === 'HIRED' ? Number(r.hire_price_per_ton ?? 0) * Number(r.tonnage) : 0));
    const expensesTotal = sum(expenses.rows, (r) => Number(r.amount_uzs));

    res.json({
      number,
      machine: machine.rows[0] ?? null,
      carriers: [...new Set(trips.rows.map((t) => t.carrier_name).filter(Boolean))],
      trips: trips.rows,
      expenses: expenses.rows,
      summary: {
        tripCount: trips.rows.length,
        tonnage: sum(trips.rows, (r) => Number(r.tonnage)),
        revenue,
        hireCost,
        expensesTotal,
        margin: revenue - hireCost - expensesTotal,
      },
    });
  }),
);
