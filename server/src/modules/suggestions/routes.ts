import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const suggestionsRouter = Router();

// Подсказки для текстовых полей (выпадающие списки): то, что уже вводили раньше, чтобы не печатать
// одно и то же. Перевозчики и плательщики — не справочники, поэтому берём из самих операций.
suggestionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [carriers, plates, payers, expenseTypes, routes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT carrier_name AS v FROM (
           SELECT carrier_name FROM sales WHERE carrier_name IS NOT NULL AND carrier_name <> ''
           UNION SELECT carrier_name FROM cash_expense WHERE carrier_name IS NOT NULL AND carrier_name <> ''
         ) t ORDER BY v`,
      ),
      pool.query(
        `SELECT DISTINCT machine_number AS v FROM (
           SELECT machine_number FROM sales WHERE machine_number IS NOT NULL AND machine_number <> ''
           UNION SELECT machine_number FROM cash_expense WHERE machine_number IS NOT NULL AND machine_number <> ''
           UNION SELECT machine_number FROM incoming WHERE machine_number IS NOT NULL AND machine_number <> ''
         ) t ORDER BY v`,
      ),
      pool.query(`SELECT DISTINCT payer_name AS v FROM cash_income WHERE payer_name IS NOT NULL AND payer_name <> '' ORDER BY v`),
      pool.query(`SELECT DISTINCT expense_type AS v FROM cash_expense WHERE expense_type IS NOT NULL AND expense_type <> '' ORDER BY v`),
      pool.query(`SELECT DISTINCT route AS v FROM sales WHERE route IS NOT NULL AND route <> '' ORDER BY v`),
    ]);
    res.json({
      carriers: carriers.rows.map((r) => r.v),
      plates: plates.rows.map((r) => r.v),
      payers: payers.rows.map((r) => r.v),
      expenseTypes: expenseTypes.rows.map((r) => r.v),
      routes: routes.rows.map((r) => r.v),
    });
  }),
);
