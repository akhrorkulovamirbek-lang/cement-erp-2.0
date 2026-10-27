import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { CARRIER_BALANCES_SQL } from '../../lib/carrierBalances.js';

export const reportsRouter = Router();

// Раздел 12.2 ТЗ: цены в Приходе/Продаже — только в сумах, доллары только в движении денег.
export const UZS_SALE = `s.total_sum`;
// extra_amount — смешанный платёж одной строкой (раздел «Ясность по деньгам»): вторая часть в
// валюте, дополняющей currency, учитываем её в конвертации тем же курсом usd_rate.
export const UZS_INCOME = `
  (CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END)
  + COALESCE(CASE WHEN currency = 'USD' THEN extra_amount ELSE extra_amount * usd_rate END, 0)
`;
export const UZS_EXPENSE = `CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END`;

// Раздел 9.2 ТЗ «Оплата товаром»: клиент гасит долг цементом — incoming.warehouse='CLIENT_GOODS'
// считается оплатой наравне с cash_income, но НЕ покупкой у завода (см. CLIENT_GOODS_EXCLUDE ниже).
export const CLIENT_PAID_SUBQUERY = `
  SELECT client_id, SUM(amount_uzs) AS total FROM (
    SELECT client_id, (${UZS_INCOME}) AS amount_uzs FROM cash_income WHERE client_id IS NOT NULL
    UNION ALL
    SELECT client_id, total_sum AS amount_uzs FROM incoming WHERE warehouse = 'CLIENT_GOODS' AND client_id IS NOT NULL
    UNION ALL
    SELECT client_id, -amount AS amount_uzs FROM client_debt_adjustments WHERE amount < 0
    UNION ALL
    -- Мы заплатили деньгами клиенту-поставщику: наш долг ему уменьшился, значит его «оплата» отрицательная.
    SELECT client_id, -(${UZS_EXPENSE}) AS amount_uzs FROM cash_expense WHERE category = 'контрагент' AND client_id IS NOT NULL
  ) t GROUP BY client_id
`;
// Корректировка долга клиента: положительная увеличивает «куплено», отрицательная уходит в «оплачено».
export const CLIENT_ADJ_PLUS_SUBQUERY = `SELECT client_id, SUM(amount) AS total FROM client_debt_adjustments WHERE amount > 0 GROUP BY client_id`;
const ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS = `warehouse <> 'CLIENT_GOODS'`;

reportsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const from = (req.query.from as string) || '1970-01-01';
    const to = (req.query.to as string) || '2999-12-31';

    const [revenue, cashIn, cashOut, brokerAcc, topClients, topMarks, dailyTrend, lowStock, awaiting, purchases] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(${UZS_SALE}), 0) AS revenue, COALESCE(SUM(s.margin_total), 0) AS profit, COUNT(*)::int AS count,
                COALESCE(SUM(s.tonnage), 0) AS tonnage
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
      // Заказы, принятые, но ещё не отгруженные — за всё время, не за выбранный период.
      pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(tonnage), 0) AS tonnage FROM sales WHERE awaiting_shipment = true`),
      // Закуплено за период: приходы на склад/напрямую и тикеты биржи (оплата товаром от клиентов — не закупка).
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM (
           SELECT total_sum AS total FROM incoming WHERE warehouse IN ('FACT', 'DIRECT') AND date BETWEEN $1 AND $2
           UNION ALL
           SELECT bought_sum AS total FROM tickets WHERE date BETWEEN $1 AND $2
         ) t`,
        [from, to],
      ),
    ]);

    res.json({
      revenue: Number(revenue.rows[0].revenue),
      profit: Number(revenue.rows[0].profit),
      salesCount: Number(revenue.rows[0].count),
      soldTonnage: Number(revenue.rows[0].tonnage),
      purchasedSum: Number(purchases.rows[0].total),
      cashIn: Number(cashIn.rows[0].total),
      cashOut: Number(cashOut.rows[0].total),
      brokerBalance: Number(brokerAcc.rows[0]?.balance ?? 0),
      topClients: topClients.rows,
      topMarks: topMarks.rows,
      dailyTrend: dailyTrend.rows,
      warehouseBalance: lowStock.rows,
      awaitingShipmentCount: awaiting.rows[0].count,
      awaitingShipmentTonnage: Number(awaiting.rows[0].tonnage),
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
              c.initial_debt + COALESCE(sales_total.total, 0) + COALESCE(adj_plus.total, 0) AS purchased,
              COALESCE(paid_total.total, 0) AS paid,
              c.initial_debt + COALESCE(sales_total.total, 0) + COALESCE(adj_plus.total, 0) - COALESCE(paid_total.total, 0) AS balance
       FROM clients c
       LEFT JOIN (
         SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s WHERE client_id IS NOT NULL GROUP BY client_id
       ) sales_total ON sales_total.client_id = c.id
       LEFT JOIN (${CLIENT_ADJ_PLUS_SUBQUERY}) adj_plus ON adj_plus.client_id = c.id
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
        `SELECT c.id, c.name, c.initial_debt + COALESCE(s.total, 0) + COALESCE(a.total, 0) - COALESCE(p.total, 0) AS balance
         FROM clients c
         LEFT JOIN (SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s WHERE client_id IS NOT NULL GROUP BY client_id) s ON s.client_id = c.id
         LEFT JOIN (${CLIENT_ADJ_PLUS_SUBQUERY}) a ON a.client_id = c.id
         LEFT JOIN (${CLIENT_PAID_SUBQUERY}) p ON p.client_id = c.id
         WHERE c.initial_debt + COALESCE(s.total, 0) + COALESCE(a.total, 0) - COALESCE(p.total, 0) <> 0
         ORDER BY balance DESC`,
      ),
      pool.query(
        `SELECT z.id, z.name, z.initial_debt + COALESCE(i.total, 0) - COALESCE(p.total, 0) AS balance
         FROM zavody z
         LEFT JOIN (SELECT zavod_id, SUM(total_sum) AS total FROM incoming WHERE ${ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS} GROUP BY zavod_id) i ON i.zavod_id = z.id
         LEFT JOIN (SELECT zavod_id, SUM(${UZS_EXPENSE}) AS total FROM cash_expense WHERE zavod_id IS NOT NULL AND category = 'цемент' GROUP BY zavod_id) p ON p.zavod_id = z.id
         WHERE z.initial_debt + COALESCE(i.total, 0) - COALESCE(p.total, 0) <> 0
         ORDER BY balance DESC`,
      ),
      pool.query(`SELECT name, logist_id, balance FROM (${CARRIER_BALANCES_SQL}) c WHERE balance <> 0 ORDER BY balance DESC`),
    ]);

    // Баланс > 0 — должны нам (клиент) / мы должны (завод, перевозчик); < 0 — переплата в обратную
    // сторону: клиент заплатил вперёд (мы должны ему), завод или перевозчик получил больше, чем
    // начислено (они должны нам). Раньше такие строки отбрасывались и нигде не показывались.
    const debt = (rows: { balance: string }[]) => rows.filter((r) => Number(r.balance) > 0);
    const over = (rows: { balance: string }[]) =>
      rows.filter((r) => Number(r.balance) < 0).map((r) => ({ ...r, balance: String(-Number(r.balance)) })).sort((a, b) => Number(b.balance) - Number(a.balance));
    const sum = (rows: { balance: string }[]) => rows.reduce((s, r) => s + Number(r.balance), 0);
    res.json({
      clientDebtTotal: sum(debt(clients.rows)),
      zavodDebtTotal: sum(debt(zavody.rows)),
      carrierDebtTotal: sum(debt(carriers.rows)),
      topClients: debt(clients.rows).slice(0, 5),
      topZavody: debt(zavody.rows).slice(0, 5),
      topCarriers: debt(carriers.rows).slice(0, 5),
      clientOverpaidTotal: sum(over(clients.rows)),
      zavodOverpaidTotal: sum(over(zavody.rows)),
      carrierOverpaidTotal: sum(over(carriers.rows)),
      topClientsOverpaid: over(clients.rows).slice(0, 5),
      topZavodyOverpaid: over(zavody.rows).slice(0, 5),
      topCarriersOverpaid: over(carriers.rows).slice(0, 5),
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

// Отчёт «Поставщики»: у кого мы покупаем цемент — заводы и клиенты с пометкой «Поставщик». По каждому:
// сколько цемента получили и на какую сумму, что продали ему, сколько денег заплатили мы и он, и итог.
// we_owe > 0 — мы должны ему, we_owe < 0 — он должен нам. У клиента-поставщика итог — общий баланс
// карточки клиента с обратным знаком (продажи ему, цемент от него, деньги в обе стороны, корректировки).
reportsRouter.get(
  '/suppliers',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT 'zavod' AS type, z.id, z.name,
              COALESCE(inc.tonnage, 0) AS received_tonnage,
              z.initial_debt + COALESCE(inc.total, 0) AS received_sum,
              0 AS sold_sum,
              COALESCE(pay.total, 0) AS paid_by_us,
              0 AS paid_by_him,
              z.initial_debt + COALESCE(inc.total, 0) - COALESCE(pay.total, 0) AS we_owe
       FROM zavody z
       LEFT JOIN (
         SELECT zavod_id, SUM(tonnage) AS tonnage, SUM(total_sum) AS total
         FROM incoming WHERE ${ZAVOD_PURCHASED_EXCLUDE_CLIENT_GOODS} GROUP BY zavod_id
       ) inc ON inc.zavod_id = z.id
       LEFT JOIN (
         SELECT zavod_id, SUM(${UZS_EXPENSE}) AS total FROM cash_expense
         WHERE zavod_id IS NOT NULL AND category = 'цемент' GROUP BY zavod_id
       ) pay ON pay.zavod_id = z.id
       UNION ALL
       SELECT 'client' AS type, c.id, c.name,
              COALESCE(goods.tonnage, 0) AS received_tonnage,
              COALESCE(goods.total, 0) AS received_sum,
              COALESCE(sold.total, 0) AS sold_sum,
              COALESCE(paid_him.total, 0) AS paid_by_us,
              COALESCE(paid_us.total, 0) AS paid_by_him,
              -(c.initial_debt + COALESCE(sold.total, 0) + COALESCE(adj_plus.total, 0) - COALESCE(paid_total.total, 0)) AS we_owe
       FROM clients c
       LEFT JOIN (SELECT client_id, SUM(tonnage) AS tonnage, SUM(total_sum) AS total FROM incoming WHERE warehouse = 'CLIENT_GOODS' AND client_id IS NOT NULL GROUP BY client_id) goods ON goods.client_id = c.id
       LEFT JOIN (SELECT client_id, SUM(${UZS_SALE}) AS total FROM sales s WHERE client_id IS NOT NULL GROUP BY client_id) sold ON sold.client_id = c.id
       LEFT JOIN (SELECT client_id, SUM(${UZS_EXPENSE}) AS total FROM cash_expense WHERE category = 'контрагент' AND client_id IS NOT NULL GROUP BY client_id) paid_him ON paid_him.client_id = c.id
       LEFT JOIN (SELECT client_id, SUM(${UZS_INCOME}) AS total FROM cash_income WHERE client_id IS NOT NULL GROUP BY client_id) paid_us ON paid_us.client_id = c.id
       LEFT JOIN (${CLIENT_ADJ_PLUS_SUBQUERY}) adj_plus ON adj_plus.client_id = c.id
       LEFT JOIN (${CLIENT_PAID_SUBQUERY}) paid_total ON paid_total.client_id = c.id
       WHERE c.is_supplier = true
       ORDER BY type, name`,
    );
    res.json(rows);
  }),
);

// Отчёт «Перевозчики»: по каждому — начислено за наёмные рейсы, выплачено, баланс. balance > 0 —
// мы должны перевозчику, balance < 0 — переплата, перевозчик должен нам.
reportsRouter.get(
  '/carriers',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`SELECT * FROM (${CARRIER_BALANCES_SQL}) c ORDER BY balance DESC`);
    res.json(rows);
  }),
);

// Раздел 4 ТЗ: остатки по Наличным/Карте/Переводу вверху Кассы. Основные поля — всё в сумах (как
// раньше, доллары конвертируются по курсу операции); uzs/usd — отдельные кассы: в каждой только
// деньги своей валюты, без пересчёта (доллары в долларах).
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

    const { rows: legs } = await pool.query(
      `SELECT payment_type, currency, COALESCE(SUM(signed), 0) AS balance FROM (
         SELECT payment_type, currency, amount AS signed FROM cash_income
         UNION ALL
         SELECT payment_type, CASE WHEN currency = 'USD' THEN 'UZS' ELSE 'USD' END AS currency, extra_amount AS signed
           FROM cash_income WHERE extra_amount IS NOT NULL
         UNION ALL
         SELECT payment_type, currency, -amount AS signed FROM cash_expense
       ) t GROUP BY payment_type, currency`,
    );
    const register = (cur: 'UZS' | 'USD') => {
      const m = Object.fromEntries(legs.filter((l) => l.currency === cur).map((l) => [l.payment_type, Number(l.balance)]));
      const out = { наличка: m['наличка'] ?? 0, карта: m['карта'] ?? 0, перечисление: m['перечисление'] ?? 0, total: 0 };
      out.total = out.наличка + out.карта + out.перечисление;
      return out;
    };

    res.json({
      наличка: byType['наличка'] ?? 0,
      карта: byType['карта'] ?? 0,
      перечисление: byType['перечисление'] ?? 0,
      total: Object.values(byType).reduce((s: number, v) => s + (v as number), 0),
      uzs: register('UZS'),
      usd: register('USD'),
    });
  }),
);
