import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите марку цемента'),
  active: z.coerce.boolean().default(true),
});

export const cementMarksRouter = createRefRouter({
  table: 'cement_marks',
  columns: ['name', 'active'],
  schema,
  searchColumn: 'name',
});

/** Сверка упаковки (только чтение): что написано в названии марки («42,5 мешок») и какая упаковка стоит в записях.
 * Нужна перед объединением марок, чтобы убедиться, что мешок/навал не перепутаны. */
const hintOf = (name: string): 'MESHOK' | 'NAVAL' | null => {
  const n = name.toLowerCase();
  if (n.includes('мешок') || n.includes('мешк')) return 'MESHOK';
  if (n.includes('навал')) return 'NAVAL';
  return null;
};

cementMarksRouter.get(
  '/packaging-check',
  asyncHandler(async (_req, res) => {
    const [marks, docs, stock] = await Promise.all([
      pool.query('SELECT id, name, active FROM cement_marks ORDER BY name'),
      pool.query(
        `SELECT 'incoming' AS src, i.id, i.date, i.cement_mark_id, i.packaging, i.tonnage, z.name AS who,
                i.price_per_ton AS price, i.total_sum AS sum, i.machine_number AS machine
           FROM incoming i JOIN zavody z ON z.id = i.zavod_id
         UNION ALL
         SELECT 'sales', s.id, s.date, s.cement_mark_id, s.packaging, s.tonnage, c.name,
                s.price_per_ton, s.total_sum, COALESCE(ov.number, s.machine_number)
           FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
           WHERE s.sale_type = 'CEMENT' AND s.cement_mark_id IS NOT NULL
         UNION ALL
         SELECT 'tickets', t.id, t.date, t.cement_mark_id, t.packaging, t.bought_tonnage, t.ticket_number,
                t.price_per_ton, t.bought_sum, NULL
           FROM tickets t
         ORDER BY date DESC, id DESC`,
      ),
      pool.query('SELECT cement_mark_id, packaging, SUM(tonnage) AS tonnage FROM warehouse_balance GROUP BY cement_mark_id, packaging'),
    ]);

    type Cell = { incoming: number; sales: number; tickets: number; stockTon: number };
    const empty = (): Cell => ({ incoming: 0, sales: 0, tickets: 0, stockTon: 0 });
    const mismatches: { src: string; id: number; date: string; mark: string; packaging: string | null; expected: string; tonnage: number; who: string | null; price: number | null; sum: number | null; machine: string | null }[] = [];

    const result = marks.rows.map((m) => {
      const hint = hintOf(m.name);
      const by: Record<'MESHOK' | 'NAVAL', Cell> = { MESHOK: empty(), NAVAL: empty() };
      let wrong = 0;
      for (const d of docs.rows.filter((r) => r.cement_mark_id === m.id)) {
        const pk = d.packaging as 'MESHOK' | 'NAVAL' | null;
        if (pk) by[pk][d.src as 'incoming' | 'sales' | 'tickets'] += 1;
        if (hint && pk !== hint) {
          wrong += 1;
          mismatches.push({ src: d.src, id: d.id, date: d.date, mark: m.name, packaging: pk, expected: hint, tonnage: Number(d.tonnage), who: d.who, price: d.price != null ? Number(d.price) : null, sum: d.sum != null ? Number(d.sum) : null, machine: d.machine ?? null });
        }
      }
      for (const st of stock.rows.filter((r) => r.cement_mark_id === m.id)) by[st.packaging as 'MESHOK' | 'NAVAL'].stockTon += Number(st.tonnage);
      const stockWrong = hint ? by[hint === 'MESHOK' ? 'NAVAL' : 'MESHOK'].stockTon : 0;
      return { id: m.id, name: m.name, active: m.active, hint, by, wrong, stockWrong };
    });
    res.json({ marks: result, mismatches, mismatchTotal: mismatches.length });
  }),
);
