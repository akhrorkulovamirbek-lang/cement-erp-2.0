import type pg from 'pg';
import { conflict } from '../../lib/errors.js';

interface IncomingEvent {
  kind: 'in';
  date: string;
  createdAt: Date;
  tonnage: number;
  price: number;
}
interface OutEvent {
  kind: 'out';
  date: string;
  createdAt: Date;
  tonnage: number;
  saleId: number;
}
type StockEvent = IncomingEvent | OutEvent;

/**
 * Replays the full incoming/sales history for one (zavod_id, cement_mark_id, packaging) key —
 * раздел 5 ТЗ: остаток «Факт» считается именно по этой тройке, не только по марке+упаковке —
 * to derive the current warehouse balance and moving-average cost, and backfills cost/margin on
 * every affected warehouse-sourced sale. Run inside the same transaction as any write that
 * touches incoming or warehouse sales for this key — this is what keeps edit/delete consistent
 * without needing to hand-write reversal math for a moving average.
 */
export async function recomputeWarehouseBalance(
  client: pg.PoolClient,
  zavodId: number,
  cementMarkId: number,
  packaging: string,
) {
  const incomingRes = await client.query(
    `SELECT id, date, tonnage, price_per_ton, created_at FROM incoming
     WHERE warehouse IN ('FACT', 'CLIENT_GOODS') AND is_historical = false
       AND zavod_id = $1 AND cement_mark_id = $2 AND packaging = $3`,
    [zavodId, cementMarkId, packaging],
  );
  const salesRes = await client.query(
    `SELECT id, date, tonnage, created_at FROM sales
     WHERE source = 'warehouse' AND is_historical = false
       AND zavod_id = $1 AND cement_mark_id = $2 AND packaging = $3`,
    [zavodId, cementMarkId, packaging],
  );

  const events: StockEvent[] = [
    ...incomingRes.rows.map(
      (r): IncomingEvent => ({
        kind: 'in',
        date: r.date,
        createdAt: r.created_at,
        tonnage: Number(r.tonnage),
        price: Number(r.price_per_ton),
      }),
    ),
    ...salesRes.rows.map(
      (r): OutEvent => ({
        kind: 'out',
        date: r.date,
        createdAt: r.created_at,
        tonnage: Number(r.tonnage),
        saleId: r.id,
      }),
    ),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime());

  let qty = 0;
  let value = 0;
  const saleUpdates: { id: number; costPerTon: number }[] = [];

  for (const ev of events) {
    if (ev.kind === 'in') {
      value += ev.tonnage * ev.price;
      qty += ev.tonnage;
    } else {
      if (ev.tonnage > qty + 1e-6) {
        throw conflict(
          `Операция приводит к отрицательному остатку склада на ${ev.date} — сначала скорректируйте связанные приходы/продажи`,
        );
      }
      const avg = qty > 0 ? value / qty : 0;
      value -= ev.tonnage * avg;
      qty -= ev.tonnage;
      saleUpdates.push({ id: ev.saleId, costPerTon: avg });
    }
  }

  const finalAvg = qty > 1e-6 ? value / qty : 0;

  await client.query(
    `INSERT INTO warehouse_balance (zavod_id, cement_mark_id, packaging, tonnage, avg_cost_per_ton, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (zavod_id, cement_mark_id, packaging)
     DO UPDATE SET tonnage = $4, avg_cost_per_ton = $5, updated_at = now()`,
    [zavodId, cementMarkId, packaging, qty, finalAvg],
  );

  for (const u of saleUpdates) {
    // margin — только по цементу, без учёта доставки, которая теперь входит в total_sum
    // (раздел 3 ТЗ, формула итога): margin = tonnage*price_per_ton - cost_total, не total_sum - cost_total.
    await client.query(
      `UPDATE sales SET cost_per_ton = $1, cost_total = $1 * tonnage, margin_total = (price_per_ton * tonnage) - ($1 * tonnage) WHERE id = $2`,
      [u.costPerTon, u.id],
    );
  }
}

export async function getWarehouseBalance(
  client: pg.Pool | pg.PoolClient,
  zavodId: number,
  cementMarkId: number,
  packaging: string,
): Promise<{ tonnage: number; avgCostPerTon: number }> {
  const { rows } = await client.query(
    `SELECT tonnage, avg_cost_per_ton FROM warehouse_balance WHERE zavod_id = $1 AND cement_mark_id = $2 AND packaging = $3`,
    [zavodId, cementMarkId, packaging],
  );
  if (!rows[0]) return { tonnage: 0, avgCostPerTon: 0 };
  return { tonnage: Number(rows[0].tonnage), avgCostPerTon: Number(rows[0].avg_cost_per_ton) };
}
