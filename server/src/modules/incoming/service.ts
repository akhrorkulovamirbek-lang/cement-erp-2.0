import type pg from 'pg';
import type { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { recomputeWarehouseBalance } from '../warehouse/service.js';
import type { incomingSchema } from './schema.js';

type IncomingInput = z.infer<typeof incomingSchema>;

export async function createIncoming(client: pg.PoolClient, data: IncomingInput) {
  const totalSum = data.tonnage * data.price_per_ton;
  const { rows } = await client.query(
    `INSERT INTO incoming (date, machine_number, machine_own, cement_mark_id, type, tonnage, price_per_ton, total_sum, zavod_id, warehouse_received)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.date,
      data.machine_number,
      data.machine_own,
      data.cement_mark_id,
      data.type,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.zavod_id,
      data.warehouse_received,
    ],
  );
  await recomputeWarehouseBalance(client, data.cement_mark_id, data.type);
  return rows[0];
}

export async function updateIncoming(client: pg.PoolClient, id: number, data: IncomingInput) {
  const { rows: existingRows } = await client.query('SELECT * FROM incoming WHERE id = $1 FOR UPDATE', [id]);
  const existing = existingRows[0];
  if (!existing) throw notFound('Приход не найден');

  const totalSum = data.tonnage * data.price_per_ton;
  const { rows } = await client.query(
    `UPDATE incoming SET date=$1, machine_number=$2, machine_own=$3, cement_mark_id=$4, type=$5,
       tonnage=$6, price_per_ton=$7, total_sum=$8, zavod_id=$9, warehouse_received=$10
     WHERE id=$11 RETURNING *`,
    [
      data.date,
      data.machine_number,
      data.machine_own,
      data.cement_mark_id,
      data.type,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.zavod_id,
      data.warehouse_received,
      id,
    ],
  );

  await recomputeWarehouseBalance(client, existing.cement_mark_id, existing.type);
  if (existing.cement_mark_id !== data.cement_mark_id || existing.type !== data.type) {
    await recomputeWarehouseBalance(client, data.cement_mark_id, data.type);
  }
  return rows[0];
}

export async function deleteIncoming(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('DELETE FROM incoming WHERE id = $1 RETURNING *', [id]);
  const deleted = rows[0];
  if (!deleted) throw notFound('Приход не найден');
  await recomputeWarehouseBalance(client, deleted.cement_mark_id, deleted.type);
}
