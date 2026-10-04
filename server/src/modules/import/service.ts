import type pg from 'pg';
import type { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { computeFreightTotal, type VehicleType } from '../../lib/pricing.js';
import type { importCashSchema, importIncomingSchema, importSaleSchema, importWarehouseSnapshotSchema } from './schema.js';

type IncomingInput = z.infer<typeof importIncomingSchema>['rows'][number];
type SaleInput = z.infer<typeof importSaleSchema>['rows'][number];
type CashInput = z.infer<typeof importCashSchema>['rows'][number];
type SnapshotInput = z.infer<typeof importWarehouseSnapshotSchema>['rows'][number];

/** Находит запись по имени в простом справочнике (clients/zavody/cement_marks) или создаёт
 * новую, если имени ещё нет — раздел «Импорт данных»: не останавливаем загрузку файла из-за
 * контрагента, которого пока нет в системе, заводим его автоматически (подтверждено владельцем). */
async function resolveOrCreateByName(client: pg.PoolClient, table: string, name: string): Promise<number> {
  const trimmed = name.trim();
  const { rows } = await client.query(`SELECT id FROM ${table} WHERE name = $1`, [trimmed]);
  if (rows[0]) return rows[0].id as number;
  const { rows: created } = await client.query(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [trimmed]);
  return created[0].id as number;
}

export async function importIncoming(client: pg.PoolClient, rows: IncomingInput[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const zavodId = await resolveOrCreateByName(client, 'zavody', row.zavod);
    const cementMarkId = await resolveOrCreateByName(client, 'cement_marks', row.cement_mark);
    const totalSum = row.tonnage * row.price_per_ton;
    await client.query(
      `INSERT INTO incoming (date, warehouse, zavod_id, cement_mark_id, packaging, tonnage, price_per_ton, total_sum, machine_number, comment, is_historical)
       VALUES ($1,'FACT',$2,$3,$4,$5,$6,$7,$8,$9,true)`,
      [row.date, zavodId, cementMarkId, row.packaging, row.tonnage, row.price_per_ton, totalSum, row.machine_number ?? null, row.comment ?? null],
    );
    count++;
  }
  return count;
}

export async function importSales(client: pg.PoolClient, rows: SaleInput[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const clientId = await resolveOrCreateByName(client, 'clients', row.client);

    let zavodId: number | null = null;
    let cementMarkId: number | null = null;
    if (row.sale_type === 'CEMENT') {
      if (!row.zavod || !row.cement_mark || !row.packaging) {
        throw badRequest(`Клиент «${row.client}»: для типа «Цемент» нужны завод, марка и упаковка`);
      }
      zavodId = await resolveOrCreateByName(client, 'zavody', row.zavod);
      cementMarkId = await resolveOrCreateByName(client, 'cement_marks', row.cement_mark);
    }

    const vehicleType = row.vehicle_type as VehicleType;
    const freightTotal = computeFreightTotal(vehicleType, row.tonnage, row.freight_price_per_ton);
    const pricePerTon = row.sale_type === 'CEMENT' ? (row.price_per_ton ?? 0) : null;
    const totalSum = row.sale_type === 'CEMENT' ? row.tonnage * (pricePerTon ?? 0) + freightTotal : freightTotal;

    await client.query(
      `INSERT INTO sales (date, sale_type, client_id, source, zavod_id, cement_mark_id, packaging, tonnage, price_per_ton,
         cost_per_ton, cost_total, margin_total, vehicle_type, machine_number, carrier_name, freight_price_per_ton,
         hire_price_per_ton, total_sum, comment, is_historical)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,0,0,0,$9,$10,$11,$12,$13,$14,$15,true)`,
      [
        row.date,
        row.sale_type,
        clientId,
        zavodId,
        cementMarkId,
        row.packaging ?? null,
        row.tonnage,
        pricePerTon,
        vehicleType,
        // own_vehicle_id (ссылка на реальный справочник machines) здесь не резолвится — импорт
        // не должен заводить исторические номера в парк активной техники; для OWN, как и для
        // CLIENT/HIRED, номер просто сохраняется текстом, иначе он терялся бы молча.
        row.machine_number ?? null,
        vehicleType === 'HIRED' ? (row.carrier_name ?? null) : null,
        vehicleType === 'CLIENT' ? null : (row.freight_price_per_ton ?? null),
        vehicleType === 'HIRED' ? (row.hire_price_per_ton ?? null) : null,
        totalSum,
        row.comment ?? null,
      ],
    );
    count++;
  }
  return count;
}

export async function importCash(client: pg.PoolClient, rows: CashInput[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const usdRate = row.currency === 'USD' ? (row.usd_rate ?? null) : null;
    if (row.type === 'income') {
      const clientId = row.client ? await resolveOrCreateByName(client, 'clients', row.client) : null;
      await client.query(
        `INSERT INTO cash_income (date, category, client_id, amount, currency, usd_rate, payment_type, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.date, row.category, clientId, row.amount, row.currency, usdRate, row.payment_type, row.comment ?? null],
      );
    } else {
      const zavodId = row.zavod ? await resolveOrCreateByName(client, 'zavody', row.zavod) : null;
      await client.query(
        `INSERT INTO cash_expense (date, category, zavod_id, carrier_name, amount, currency, usd_rate, payment_type, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.date, row.category, zavodId, row.carrier_name ?? null, row.amount, row.currency, usdRate, row.payment_type, row.comment ?? null],
      );
    }
    count++;
  }
  return count;
}

export async function importWarehouseSnapshot(client: pg.PoolClient, rows: SnapshotInput[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const zavodId = await resolveOrCreateByName(client, 'zavody', row.zavod);
    const cementMarkId = await resolveOrCreateByName(client, 'cement_marks', row.cement_mark);
    await client.query(
      `INSERT INTO warehouse_balance (zavod_id, cement_mark_id, packaging, tonnage, avg_cost_per_ton, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (zavod_id, cement_mark_id, packaging)
       DO UPDATE SET tonnage = $4, avg_cost_per_ton = $5, updated_at = now()`,
      [zavodId, cementMarkId, row.packaging, row.tonnage, row.avg_cost_per_ton],
    );
    count++;
  }
  return count;
}
