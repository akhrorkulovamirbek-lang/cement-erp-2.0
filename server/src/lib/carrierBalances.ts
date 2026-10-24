/** Баланс по каждому перевозчику (логисту): начислено за наёмные рейсы + начальный долг и плюсовые
 * корректировки логиста, выплачено из кассы + минусовые корректировки. balance > 0 — мы должны ему,
 * balance < 0 — переплата, он должен нам. Перевозчик связан с рейсами и выплатами по имени (без
 * учёта регистра и пробелов по краям), поэтому у логиста из справочника и у «разового» перевозчика
 * из старых рейсов один и тот же расчёт. Результат: name, logist_id, owed, paid, balance. */
export const CARRIER_BALANCES_SQL = `
  WITH hired AS (
    SELECT norm_name(carrier_name) AS k, min(btrim(carrier_name)) AS name,
           SUM(tonnage * hire_price_per_ton) AS amount
    FROM sales
    WHERE vehicle_type = 'HIRED' AND carrier_name IS NOT NULL AND btrim(carrier_name) <> ''
    GROUP BY 1
  ),
  paid AS (
    SELECT norm_name(carrier_name) AS k, min(btrim(carrier_name)) AS name,
           SUM(CASE WHEN currency = 'USD' THEN amount * usd_rate ELSE amount END) AS amount
    FROM cash_expense
    WHERE category = 'перевозчик' AND carrier_name IS NOT NULL AND btrim(carrier_name) <> ''
    GROUP BY 1
  ),
  lg AS (
    SELECT l.id, norm_name(l.name) AS k, l.name,
           l.initial_debt + COALESCE((SELECT SUM(a.amount) FROM logist_debt_adjustments a WHERE a.logist_id = l.id AND a.amount > 0), 0) AS plus,
           COALESCE((SELECT -SUM(a.amount) FROM logist_debt_adjustments a WHERE a.logist_id = l.id AND a.amount < 0), 0) AS minus
    FROM logists l
  ),
  keys AS (SELECT k FROM hired UNION SELECT k FROM paid UNION SELECT k FROM lg)
  SELECT COALESCE(lg.name, hired.name, paid.name) AS name,
         lg.id AS logist_id,
         COALESCE(hired.amount, 0) + COALESCE(lg.plus, 0) AS owed,
         COALESCE(paid.amount, 0) + COALESCE(lg.minus, 0) AS paid,
         COALESCE(hired.amount, 0) + COALESCE(lg.plus, 0) - COALESCE(paid.amount, 0) - COALESCE(lg.minus, 0) AS balance
  FROM keys
  LEFT JOIN hired ON hired.k = keys.k
  LEFT JOIN paid ON paid.k = keys.k
  LEFT JOIN lg ON lg.k = keys.k
`;
