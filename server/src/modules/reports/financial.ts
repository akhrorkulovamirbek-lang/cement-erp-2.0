import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { UZS_EXPENSE } from './routes.js';

/** Финансовые отчёты: прибыль и убытки по направлениям, маржа по сделкам, движение денег, брокерский счёт,
 * остатки и прибыль по машинам. Период — from/to (по умолчанию за всё время).
 *
 * Принципы учёта:
 *  - выручка и себестоимость цемента — по продажам (начисление), а не по оплатам;
 *  - загруженная история (is_historical) без себестоимости в отчёты по цементу не входит;
 *  - оплаты поставщикам, пополнение брокерского счёта и платежи клиентов — не расходы и не доходы,
 *    это движение денег (они видны только в отчёте «Движение денег»). */

export const financialRouter = Router();

const range = (req: { query: Record<string, unknown> }) => ({
  from: (req.query.from as string) || '1970-01-01',
  to: (req.query.to as string) || '2999-12-31',
});
const num = (v: unknown) => Number(v ?? 0);

// ---- 1. Прибыль и убытки по направлениям ----

financialRouter.get(
  '/pnl',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const [cement, logistics, commission, other, excluded] = await Promise.all([
      pool.query(
        `SELECT COALESCE(source, 'warehouse') AS source, COUNT(*)::int AS deals,
                COALESCE(SUM(tonnage), 0) AS tonnage,
                COALESCE(SUM(tonnage * price_per_ton), 0) AS revenue,
                COALESCE(SUM(cost_total), 0) AS cost,
                COALESCE(SUM(margin_total), 0) AS margin
         FROM sales
         WHERE sale_type = 'CEMENT' AND is_historical = false AND client_id IS NOT NULL AND price_per_ton IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY COALESCE(source, 'warehouse')`,
        [from, to],
      ),
      pool.query(
        `SELECT vehicle_type, COUNT(*)::int AS trips, COALESCE(SUM(tonnage), 0) AS tonnage,
                COALESCE(SUM(tonnage * freight_price_per_ton), 0) AS revenue,
                COALESCE(SUM(tonnage * hire_price_per_ton), 0) AS hire_cost
         FROM sales
         WHERE vehicle_type IN ('OWN', 'HIRED') AND freight_price_per_ton IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY vehicle_type`,
        [from, to],
      ),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN currency = 'USD' THEN commission_amount * usd_rate ELSE commission_amount END), 0) AS total
         FROM cash_service_operations WHERE date BETWEEN $1 AND $2`,
        [from, to],
      ),
      pool.query(
        `SELECT category, COALESCE(SUM(${UZS_EXPENSE}), 0) AS total FROM cash_expense
         WHERE category IN ('логистика', 'прочее') AND date BETWEEN $1 AND $2 GROUP BY category`,
        [from, to],
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM sales WHERE sale_type = 'CEMENT' AND is_historical = true AND date BETWEEN $1 AND $2`, [from, to]),
    ]);

    const ownLogistics = logistics.rows.find((r) => r.vehicle_type === 'OWN');
    const hiredLogistics = logistics.rows.find((r) => r.vehicle_type === 'HIRED');
    const expenseOf = (c: string) => num(other.rows.find((r) => r.category === c)?.total);

    res.json({
      cement: cement.rows.map((r) => ({
        source: r.source,
        deals: r.deals,
        tonnage: num(r.tonnage),
        revenue: num(r.revenue),
        cost: num(r.cost),
        margin: num(r.margin),
      })),
      logistics: {
        own: { trips: ownLogistics?.trips ?? 0, tonnage: num(ownLogistics?.tonnage), revenue: num(ownLogistics?.revenue), cost: expenseOf('логистика') },
        hired: {
          trips: hiredLogistics?.trips ?? 0,
          tonnage: num(hiredLogistics?.tonnage),
          revenue: num(hiredLogistics?.revenue),
          cost: num(hiredLogistics?.hire_cost),
        },
      },
      other: { cashServiceCommission: num(commission.rows[0]?.total), otherExpenses: expenseOf('прочее') },
      excludedHistorical: excluded.rows[0]?.n ?? 0,
    });
  }),
);

// ---- 2. Маржа по сделкам ----

financialRouter.get(
  '/deal-margins',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const { rows } = await pool.query(
      `SELECT s.id, s.date, s.client_id, c.name AS client_name, cm.name AS mark, s.packaging, COALESCE(s.source, 'warehouse') AS source,
              s.tonnage, s.price_per_ton, s.cost_per_ton, s.tonnage * s.price_per_ton AS revenue, s.cost_total AS cost, s.margin_total AS margin
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id
       WHERE s.sale_type = 'CEMENT' AND s.is_historical = false AND s.client_id IS NOT NULL AND s.price_per_ton IS NOT NULL AND s.date BETWEEN $1 AND $2
       ORDER BY s.date DESC, s.id DESC`,
      [from, to],
    );
    res.json(rows);
  }),
);

// ---- 3. Движение денег (ДДС) ----

financialRouter.get(
  '/cash-flow',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    // Каждая операция разложена по валютам: смешанный платёж приходит двумя «ногами» (сум + доллар).
    const legs = `
      SELECT date, 'in' AS dir, category, currency, amount FROM cash_income
      UNION ALL
      SELECT date, 'in', category, CASE WHEN currency = 'USD' THEN 'UZS' ELSE 'USD' END, extra_amount FROM cash_income WHERE extra_amount IS NOT NULL
      UNION ALL
      SELECT date, 'out', category, currency, amount FROM cash_expense`;
    const [opening, period] = await Promise.all([
      pool.query(
        `SELECT currency, COALESCE(SUM(CASE WHEN dir = 'in' THEN amount ELSE -amount END), 0) AS balance FROM (${legs}) t WHERE date < $1 GROUP BY currency`,
        [from],
      ),
      pool.query(
        `SELECT dir, category, currency, COALESCE(SUM(amount), 0) AS total FROM (${legs}) t WHERE date BETWEEN $1 AND $2 GROUP BY dir, category, currency`,
        [from, to],
      ),
    ]);
    const open = (cur: string) => num(opening.rows.find((r) => r.currency === cur)?.balance);
    const group = (dir: 'in' | 'out') => {
      const cats = [...new Set(period.rows.filter((r) => r.dir === dir).map((r) => r.category as string))];
      return cats.map((category) => ({
        category,
        UZS: num(period.rows.find((r) => r.dir === dir && r.category === category && r.currency === 'UZS')?.total),
        USD: num(period.rows.find((r) => r.dir === dir && r.category === category && r.currency === 'USD')?.total),
      }));
    };
    const income = group('in');
    const expense = group('out');
    const sum = (rows: { UZS: number; USD: number }[], cur: 'UZS' | 'USD') => rows.reduce((s, r) => s + r[cur], 0);
    res.json({
      opening: { UZS: open('UZS'), USD: open('USD') },
      income,
      expense,
      closing: {
        UZS: open('UZS') + sum(income, 'UZS') - sum(expense, 'UZS'),
        USD: open('USD') + sum(income, 'USD') - sum(expense, 'USD'),
      },
    });
  }),
);

// ---- 4. Брокерский счёт ----

financialRouter.get(
  '/broker',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const signed = `CASE WHEN type = 'ticket_purchase' THEN -amount ELSE amount END`;
    const [opening, ops, current] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(${signed}), 0) AS balance FROM broker_operations WHERE date < $1`, [from]),
      pool.query(
        `SELECT bo.id, bo.date, bo.type, bo.amount, bo.description, t.ticket_number
         FROM broker_operations bo LEFT JOIN tickets t ON t.id = bo.related_ticket_id
         WHERE bo.date BETWEEN $1 AND $2 ORDER BY bo.date, bo.id`,
        [from, to],
      ),
      pool.query('SELECT balance FROM broker_account WHERE id = 1'),
    ]);
    const open = num(opening.rows[0]?.balance);
    let running = open;
    const rows = ops.rows.map((o) => {
      running += o.type === 'ticket_purchase' ? -num(o.amount) : num(o.amount);
      return { ...o, amount: num(o.amount), balance: running };
    });
    const by = (t: string) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
    res.json({
      opening: open,
      replenish: by('replenish'),
      purchases: by('ticket_purchase'),
      returns: by('ticket_return'),
      closing: running,
      currentBalance: num(current.rows[0]?.balance),
      rows,
    });
  }),
);

// ---- 5. Остатки: склад и тикеты ----

financialRouter.get(
  '/stock',
  asyncHandler(async (_req, res) => {
    const [warehouse, tickets] = await Promise.all([
      pool.query(
        `SELECT z.name AS zavod_name, cm.name AS mark, wb.packaging, wb.tonnage, wb.avg_cost_per_ton, wb.tonnage * wb.avg_cost_per_ton AS value
         FROM warehouse_balance wb JOIN zavody z ON z.id = wb.zavod_id JOIN cement_marks cm ON cm.id = wb.cement_mark_id
         WHERE wb.tonnage > 0 ORDER BY z.name, cm.name`,
      ),
      pool.query(
        `SELECT t.ticket_number, t.date, z.name AS zavod_name, cm.name AS mark, t.packaging, t.remaining_tonnage AS tonnage,
                t.price_per_ton, t.remaining_sum AS value
         FROM tickets t JOIN zavody z ON z.id = t.zavod_id JOIN cement_marks cm ON cm.id = t.cement_mark_id
         WHERE t.status = 'active' AND t.remaining_tonnage > 0 ORDER BY z.name, cm.name, t.date`,
      ),
    ]);
    res.json({
      warehouse: warehouse.rows.map((r) => ({ ...r, tonnage: num(r.tonnage), avg_cost_per_ton: num(r.avg_cost_per_ton), value: num(r.value) })),
      tickets: tickets.rows.map((r) => ({ ...r, tonnage: num(r.tonnage), price_per_ton: num(r.price_per_ton), value: num(r.value) })),
    });
  }),
);

// ---- 6. Машины и рейсы: прибыль на машину ----

financialRouter.get(
  '/machines',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const [own, ownCosts, hired] = await Promise.all([
      pool.query(
        `SELECT m.number AS label, COUNT(s.id)::int AS trips, COALESCE(SUM(s.tonnage), 0) AS tonnage,
                COALESCE(SUM(s.tonnage * s.freight_price_per_ton), 0) AS revenue
         FROM machines m LEFT JOIN sales s ON s.own_vehicle_id = m.id AND s.vehicle_type = 'OWN' AND s.date BETWEEN $1 AND $2
         GROUP BY m.id, m.number`,
        [from, to],
      ),
      pool.query(
        `SELECT machine_number AS label, COALESCE(NULLIF(expense_type, ''), 'Без типа') AS expense_type, SUM(${UZS_EXPENSE}) AS cost
         FROM cash_expense WHERE category = 'логистика' AND machine_number IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY machine_number, COALESCE(NULLIF(expense_type, ''), 'Без типа')`,
        [from, to],
      ),
      pool.query(
        // Перевозчики с разным написанием («ИП Старый», «ип старый») считаем одним — по norm_name().
        `SELECT MIN(btrim(carrier_name)) AS label, COUNT(*)::int AS trips, COALESCE(SUM(tonnage), 0) AS tonnage,
                COALESCE(SUM(tonnage * freight_price_per_ton), 0) AS revenue, COALESCE(SUM(tonnage * hire_price_per_ton), 0) AS cost
         FROM sales WHERE vehicle_type = 'HIRED' AND carrier_name IS NOT NULL AND date BETWEEN $1 AND $2 GROUP BY norm_name(carrier_name)`,
        [from, to],
      ),
    ]);
    const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
    const ownRows = own.rows
      .map((r) => {
        const costs = ownCosts.rows.filter((c) => norm(c.label) === norm(r.label)).map((c) => ({ type: c.expense_type as string, amount: num(c.cost) }));
        const cost = costs.reduce((s, c) => s + c.amount, 0);
        return { label: r.label as string, type: 'own' as const, trips: r.trips as number, tonnage: num(r.tonnage), revenue: num(r.revenue), cost, costs, profit: num(r.revenue) - cost };
      })
      .filter((r) => r.trips > 0 || r.cost > 0);
    const hiredRows = hired.rows.map((r) => ({
      label: r.label as string,
      type: 'hired' as const,
      trips: r.trips as number,
      tonnage: num(r.tonnage),
      revenue: num(r.revenue),
      cost: num(r.cost),
      costs: [{ type: 'Оплата за наём', amount: num(r.cost) }],
      profit: num(r.revenue) - num(r.cost),
    }));
    res.json([...ownRows, ...hiredRows].sort((a, b) => b.profit - a.profit));
  }),
);
