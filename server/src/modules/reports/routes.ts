import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const reportsRouter = Router();

// Раздел 12.2 ТЗ: цены в Приходе/Продаже — только в сумах, доллары только в движении денег.
const UZS_SALE = `s.total_sum`;
const UZS_INCOME = `CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END`;
const UZS_EXPENSE = `CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END`;

reportsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const from = (req.query.from as string) || '1970-01-01';
    const to = (req.query.to as string) || '2999-12-31';

    const [revenue, cashIn, cashOut, brokerAcc, topClients, topMarks, dailyTrend, lowStock] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(${UZS_SALE}), 0) AS revenue, COALESCE(SUM(s.margin_total), 0) AS profit, COUNT(*)::int AS count
         FROM sales s WHERE s.date BETWEEN $1 AND $2`,
        [from, to],
      ),
      pool.query(`SELECT COALESCE(SUM(${UZS_INCOME}), 0) AS total FROM cash_income WHERE date BETWEEN $1 AND $2`, [from, to]),
      pool.query(`SELECT COALESCE(SUM(${UZS_EXPENSE}), 0) AS total FROM cash_expense WHERE date BETWEEN $1 AND $2`, [from, to]),
      pool.query('SELECT balance FROM broker_account WHERE id = 1'),
      pool.query(
        `SELECT c.id, c.name, SUM(${UZS_SALE}) AS total
         FROM sales s JOIN clients c ON c.id = s.client_id
         WHERE s.date BETWEEN $1 AND $2
         GROUP BY c.id, c.name ORDER BY total DESC LIMIT 5`,
        [from, to],
      ),
      pool.query(
        `SELECT cm.id, cm.name, SUM(s.tonnage) AS tonnage
         FROM sales s JOIN cement_marks cm ON cm.id = s.cement_mark_id
         WHERE s.date BETWEEN $1 AND $2
         GROUP BY cm.id, cm.name ORDER BY tonnage DESC LIMIT 5`,
        [from, to],
      ),
      pool.query(
        `SELECT s.date, SUM(${UZS_SALE}) AS total
         FROM sales s WHERE s.date BETWEEN $1 AND $2
         GROUP BY s.date ORDER BY s.date`,
        [from, to],
      ),
      pool.query(
        `SELECT wb.*, cm.name AS cement_mark_name FROM warehouse_balance wb
         JOIN cement_marks cm ON cm.id = wb.cement_mark_id
         ORDER BY wb.tonnage ASC`,
      ),
    ]);

    res.json({
      revenue: Number(revenue.rows[0].revenue),
      profit: Number(revenue.rows[0].profit),
      salesCount: Number(revenue.rows[0].count),
      cashIn: Number(cashIn.rows[0].total),
      cashOut: Number(cashOut.rows[0].total),
      brokerBalance: Number(brokerAcc.rows[0]?.balance ?? 0),
      topClients: topClients.rows,
      topMarks: topMarks.rows,
      dailyTrend: dailyTrend.rows,
      warehouseBalance: lowStock.rows,
    });
  }),
);

reportsRouter.get(
  '/client-balance',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.phone,
              COALESCE(sales_total.total, 0) AS purchased,
              COALESCE(paid_total.total, 0) AS paid,
              COALESCE(sales_total.total, 0) - COALESCE(paid_total.total, 0) AS balance
       FROM clients c
       LEFT JOIN (
         SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s GROUP BY client_id
       ) sales_total ON sales_total.client_id = c.id
       LEFT JOIN (
         SELECT client_id, SUM(${UZS_INCOME}) AS total FROM cash_income WHERE client_id IS NOT NULL GROUP BY client_id
       ) paid_total ON paid_total.client_id = c.id
       ORDER BY balance DESC`,
    );
    res.json(rows);
  }),
);

reportsRouter.get(
  '/zavod-balance',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT z.id, z.name,
              COALESCE(incoming_total.total, 0) AS purchased,
              COALESCE(paid_total.total, 0) AS paid,
              COALESCE(incoming_total.total, 0) - COALESCE(paid_total.total, 0) AS balance
       FROM zavody z
       LEFT JOIN (
         SELECT zavod_id, SUM(total_sum) AS total FROM incoming GROUP BY zavod_id
       ) incoming_total ON incoming_total.zavod_id = z.id
       LEFT JOIN (
         SELECT zavod_id, SUM(${UZS_EXPENSE}) AS total FROM cash_expense
         WHERE zavod_id IS NOT NULL AND category = 'цемент' GROUP BY zavod_id
       ) paid_total ON paid_total.zavod_id = z.id
       ORDER BY balance DESC`,
    );
    res.json(rows);
  }),
);
