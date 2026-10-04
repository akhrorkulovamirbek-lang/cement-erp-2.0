import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const reportsRouter = Router();

// Раздел 12.2 ТЗ: цены в Приходе/Продаже — только в сумах, доллары только в движении денег.
const UZS_SALE = `s.total_sum`;
// extra_amount — смешанный платёж одной строкой (раздел «Ясность по деньгам»): вторая часть в
// валюте, дополняющей currency, учитываем её в конвертации тем же курсом usd_rate.
const UZS_INCOME = `
  (CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END)
  + COALESCE(CASE WHEN currency = 'USD' THEN extra_amount ELSE extra_amount * usd_rate END, 0)
`;
const UZS_EXPENSE = `CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END`;

// Раздел 9.2 ТЗ «Оплата товаром»: клиент гасит долг цементом — incoming.warehouse='CLIENT_GOODS'
// считается оплатой наравне с cash_income, но НЕ покупкой у завода (см. CLIENT_GOODS_EXCLUDE ниже).
const CLIENT_PAID_SUBQUERY = `
  SELECT client_id, SUM(amount_uzs) AS total FROM (
    SELECT client_id, (${UZS_INCOME}) AS amount_uzs FROM cash_income WHERE client_id IS NOT NULL
    UNION ALL
    SELECT client_id, total_sum AS amount_uzs FROM incoming WHERE warehouse = 'CLIENT_GOODS' AND client_id IS NOT NULL
  ) t GROUP BY client_id
`;
const ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS = `warehouse <> 'CLIENT_GOODS'`;

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

// Раздел 1 ТЗ: initial_debt — долг клиента/завода на момент начала работы в системе, до первой
// продажи/прихода. Считаем его как «виртуальную» первую покупку — тогда «куплено минус оплачено»
// на карточке всегда сходится с показанным долгом.
reportsRouter.get(
  '/client-balance',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.phone,
              c.initial_debt + COALESCE(sales_total.total, 0) AS purchased,
              COALESCE(paid_total.total, 0) AS paid,
              c.initial_debt + COALESCE(sales_total.total, 0) - COALESCE(paid_total.total, 0) AS balance
       FROM clients c
       LEFT JOIN (
         SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s GROUP BY client_id
       ) sales_total ON sales_total.client_id = c.id
       LEFT JOIN (${CLIENT_PAID_SUBQUERY}) paid_total ON paid_total.client_id = c.id
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
              z.initial_debt + COALESCE(incoming_total.total, 0) AS purchased,
              COALESCE(paid_total.total, 0) AS paid,
              z.initial_debt + COALESCE(incoming_total.total, 0) - COALESCE(paid_total.total, 0) AS balance
       FROM zavody z
       LEFT JOIN (
         SELECT zavod_id, SUM(total_sum) AS total FROM incoming WHERE ${ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS} GROUP BY zavod_id
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

// Раздел 6 ТЗ (Взаиморасчёты) — сводка для Панели, чтобы не заходить в каждый раздел отдельно.
reportsRouter.get(
  '/debts-summary',
  asyncHandler(async (_req, res) => {
    const [clients, zavody, carriers] = await Promise.all([
      pool.query(
        `SELECT c.id, c.name, c.initial_debt + COALESCE(s.total, 0) - COALESCE(p.total, 0) AS balance
         FROM clients c
         LEFT JOIN (SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s GROUP BY client_id) s ON s.client_id = c.id
         LEFT JOIN (${CLIENT_PAID_SUBQUERY}) p ON p.client_id = c.id
         WHERE c.initial_debt + COALESCE(s.total, 0) - COALESCE(p.total, 0) > 0
         ORDER BY balance DESC`,
      ),
      pool.query(
        `SELECT z.id, z.name, z.initial_debt + COALESCE(i.total, 0) - COALESCE(p.total, 0) AS balance
         FROM zavody z
         LEFT JOIN (SELECT zavod_id, SUM(total_sum) AS total FROM incoming WHERE ${ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS} GROUP BY zavod_id) i ON i.zavod_id = z.id
         LEFT JOIN (SELECT zavod_id, SUM(${UZS_EXPENSE}) AS total FROM cash_expense WHERE zavod_id IS NOT NULL AND category = 'цемент' GROUP BY zavod_id) p ON p.zavod_id = z.id
         WHERE z.initial_debt + COALESCE(i.total, 0) - COALESCE(p.total, 0) > 0
         ORDER BY balance DESC`,
      ),
      pool.query(
        `SELECT carrier_name AS name, SUM(owed) - SUM(paid) AS balance
         FROM (
           SELECT carrier_name, SUM(tonnage * hire_price_per_ton) AS owed, 0 AS paid
           FROM sales WHERE vehicle_type = 'HIRED' AND carrier_name IS NOT NULL GROUP BY carrier_name
           UNION ALL
           SELECT carrier_name, 0 AS owed, SUM(${UZS_EXPENSE}) AS paid
           FROM cash_expense WHERE category = 'перевозчик' AND carrier_name IS NOT NULL GROUP BY carrier_name
         ) t
         GROUP BY carrier_name
         HAVING SUM(owed) - SUM(paid) > 0
         ORDER BY balance DESC`,
      ),
    ]);

    const sum = (rows: { balance: string }[]) => rows.reduce((s, r) => s + Number(r.balance), 0);
    res.json({
      clientDebtTotal: sum(clients.rows),
      zavodDebtTotal: sum(zavody.rows),
      carrierDebtTotal: sum(carriers.rows),
      topClients: clients.rows.slice(0, 5),
      topZavody: zavody.rows.slice(0, 5),
      topCarriers: carriers.rows.slice(0, 5),
    });
  }),
);

// Раздел «Отчёты» → вкладка «Цемент»: по заводу×марке×упаковке — куплено (склад+напрямую+тикеты),
// отдельно получено в счёт долга (Оплата товаром — не покупка, не смешиваем с «куплено»), продано
// и маржа. Та же логика, что уже используется для долга перевозчику ниже — агрегировать разные
// источники по общему ключу через CTE и UNION, а не несколько JOIN с риском задвоения строк.
reportsRouter.get(
  '/cement',
  asyncHandler(async (req, res) => {
    const from = (req.query.from as string) || '1970-01-01';
    const to = (req.query.to as string) || '2999-12-31';
    const { rows } = await pool.query(
      `WITH purchased_raw AS (
         SELECT zavod_id, cement_mark_id, packaging, tonnage, total_sum
         FROM incoming WHERE warehouse IN ('FACT', 'DIRECT') AND date BETWEEN $1 AND $2
         UNION ALL
         SELECT zavod_id, cement_mark_id, packaging, bought_tonnage AS tonnage, bought_sum AS total_sum
         FROM tickets WHERE date BETWEEN $1 AND $2
       ),
       purchased AS (
         SELECT zavod_id, cement_mark_id, packaging, SUM(tonnage) AS tonnage, SUM(total_sum) AS total
         FROM purchased_raw GROUP BY zavod_id, cement_mark_id, packaging
       ),
       goods AS (
         SELECT zavod_id, cement_mark_id, packaging, SUM(tonnage) AS tonnage, SUM(total_sum) AS total
         FROM incoming WHERE warehouse = 'CLIENT_GOODS' AND date BETWEEN $1 AND $2
         GROUP BY zavod_id, cement_mark_id, packaging
       ),
       sold AS (
         SELECT zavod_id, cement_mark_id, packaging, SUM(tonnage) AS tonnage, SUM(total_sum) AS total, SUM(margin_total) AS margin
         FROM sales WHERE sale_type = 'CEMENT' AND date BETWEEN $1 AND $2
         GROUP BY zavod_id, cement_mark_id, packaging
       ),
       keys AS (
         SELECT zavod_id, cement_mark_id, packaging FROM purchased
         UNION
         SELECT zavod_id, cement_mark_id, packaging FROM goods
         UNION
         SELECT zavod_id, cement_mark_id, packaging FROM sold
       )
       SELECT z.name AS zavod_name, cm.name AS cement_mark_name, k.packaging,
              COALESCE(p.tonnage, 0) AS purchased_tonnage, COALESCE(p.total, 0) AS purchased_sum,
              COALESCE(g.tonnage, 0) AS goods_received_tonnage, COALESCE(g.total, 0) AS goods_received_sum,
              COALESCE(s.tonnage, 0) AS sold_tonnage, COALESCE(s.total, 0) AS sold_sum, COALESCE(s.margin, 0) AS margin_total
       FROM keys k
       JOIN zavody z ON z.id = k.zavod_id
       JOIN cement_marks cm ON cm.id = k.cement_mark_id
       LEFT JOIN purchased p ON p.zavod_id = k.zavod_id AND p.cement_mark_id = k.cement_mark_id AND p.packaging = k.packaging
       LEFT JOIN goods g ON g.zavod_id = k.zavod_id AND g.cement_mark_id = k.cement_mark_id AND g.packaging = k.packaging
       LEFT JOIN sold s ON s.zavod_id = k.zavod_id AND s.cement_mark_id = k.cement_mark_id AND s.packaging = k.packaging
       ORDER BY z.name, cm.name, k.packaging`,
      [from, to],
    );
    res.json(rows);
  }),
);

// Раздел «Отчёты» → вкладка «Логистика»: обороты за период по каждой машине/перевозчику —
// рейсы, принесла (фрахт с клиента), потрачено (расходы на эту же машину/перевозчика), маржа.
// Свои машины сопоставляются по machines.number = cash_expense.machine_number (раздел «Касса»,
// категория «логистика»), наёмные — по carrier_name (та же текстовая привязка, что уже в
// /cash-expense/carrier-balances, но здесь обороты за период, а не накопленный долг).
reportsRouter.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const from = (req.query.from as string) || '1970-01-01';
    const to = (req.query.to as string) || '2999-12-31';
    const { rows } = await pool.query(
      `WITH own AS (
         SELECT m.number AS label, COUNT(s.id)::int AS trip_count,
                COALESCE(SUM(s.freight_price_per_ton * s.tonnage), 0) AS revenue
         FROM machines m
         LEFT JOIN sales s ON s.own_vehicle_id = m.id AND s.vehicle_type = 'OWN' AND s.date BETWEEN $1 AND $2
         GROUP BY m.id, m.number
       ),
       own_cost AS (
         SELECT machine_number AS label, SUM(${UZS_EXPENSE}) AS cost
         FROM cash_expense WHERE category = 'логистика' AND machine_number IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY machine_number
       ),
       hired AS (
         SELECT carrier_name AS label, COUNT(*)::int AS trip_count,
                COALESCE(SUM(freight_price_per_ton * tonnage), 0) AS revenue
         FROM sales WHERE vehicle_type = 'HIRED' AND carrier_name IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY carrier_name
       ),
       hired_cost AS (
         SELECT carrier_name AS label, SUM(${UZS_EXPENSE}) AS cost
         FROM cash_expense WHERE category = 'перевозчик' AND carrier_name IS NOT NULL AND date BETWEEN $1 AND $2
         GROUP BY carrier_name
       )
       SELECT o.label, 'own' AS type, o.trip_count, o.revenue, COALESCE(oc.cost, 0) AS cost,
              o.revenue - COALESCE(oc.cost, 0) AS margin
       FROM own o LEFT JOIN own_cost oc ON oc.label = o.label
       WHERE o.trip_count > 0 OR oc.cost IS NOT NULL
       UNION ALL
       SELECT h.label, 'hired' AS type, h.trip_count, h.revenue, COALESCE(hc.cost, 0) AS cost,
              h.revenue - COALESCE(hc.cost, 0) AS margin
       FROM hired h LEFT JOIN hired_cost hc ON hc.label = h.label
       ORDER BY margin DESC`,
      [from, to],
    );
    res.json(rows);
  }),
);

// Раздел 4 ТЗ: остатки по Наличным/Карте/Переводу вверху Кассы.
reportsRouter.get(
  '/cash-balances',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT payment_type,
              COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_uzs ELSE -amount_uzs END), 0) AS balance
       FROM (
         SELECT payment_type, 'in' AS direction, (${UZS_INCOME}) AS amount_uzs, currency, usd_rate, amount FROM cash_income
         UNION ALL
         SELECT payment_type, 'out' AS direction, (${UZS_EXPENSE}) AS amount_uzs, currency, usd_rate, amount FROM cash_expense
       ) t
       GROUP BY payment_type`,
    );
    const byType = Object.fromEntries(rows.map((r) => [r.payment_type, Number(r.balance)]));
    res.json({
      наличка: byType['наличка'] ?? 0,
      карта: byType['карта'] ?? 0,
      перечисление: byType['перечисление'] ?? 0,
      total: Object.values(byType).reduce((s: number, v) => s + (v as number), 0),
    });
  }),
);
