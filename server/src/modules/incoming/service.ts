import type pg from 'pg';
import type { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { computeFreightTotal } from '../../lib/pricing.js';
import { recomputeWarehouseBalance } from '../warehouse/service.js';
import type { incomingSchema } from './schema.js';

type IncomingInput = z.infer<typeof incomingSchema>;

async function insertLinkedSale(client: pg.PoolClient, incomingId: number, data: IncomingInput) {
  const freightTotal = computeFreightTotal(data.vehicle_type!, data.tonnage, data.freight_price_per_ton);
  const saleTotal = data.tonnage * data.sale_price_per_ton! + freightTotal;
  const marginTotal = data.tonnage * (data.sale_price_per_ton! - data.price_per_ton);

  const { rows } = await client.query(
    `INSERT INTO sales (date, sale_type, client_id, source, zavod_id, cement_mark_id, packaging, linked_purchase_id,
       tonnage, price_per_ton, cost_per_ton, cost_total, margin_total, vehicle_type, own_vehicle_id, machine_number,
       carrier_name, freight_price_per_ton, hire_price_per_ton, total_sum, comment)
     VALUES ($1,'CEMENT',$2,'direct',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [
      data.date,
      data.client_id,
      data.zavod_id,
      data.cement_mark_id,
      data.packaging,
      incomingId,
      data.tonnage,
      data.sale_price_per_ton,
      data.price_per_ton,
      data.price_per_ton! * data.tonnage,
      marginTotal,
      data.vehicle_type,
      data.vehicle_type === 'OWN' ? data.own_vehicle_id : null,
      data.vehicle_type === 'OWN' ? null : data.sale_machine_number ?? null,
      data.vehicle_type === 'HIRED' ? data.carrier_name : null,
      data.vehicle_type === 'CLIENT' ? null : data.freight_price_per_ton,
      data.vehicle_type === 'HIRED' ? data.hire_price_per_ton : null,
      saleTotal,
      data.comment ?? null,
    ],
  );
  return rows[0].id as number;
}

async function updateLinkedSale(client: pg.PoolClient, saleId: number, incomingId: number, data: IncomingInput) {
  const freightTotal = computeFreightTotal(data.vehicle_type!, data.tonnage, data.freight_price_per_ton);
  const saleTotal = data.tonnage * data.sale_price_per_ton! + freightTotal;
  const marginTotal = data.tonnage * (data.sale_price_per_ton! - data.price_per_ton);

  await client.query(
    `UPDATE sales SET date=$1, client_id=$2, zavod_id=$3, cement_mark_id=$4, packaging=$5, linked_purchase_id=$6,
       tonnage=$7, price_per_ton=$8, cost_per_ton=$9, cost_total=$10, margin_total=$11, vehicle_type=$12,
       own_vehicle_id=$13, machine_number=$14, carrier_name=$15, freight_price_per_ton=$16, hire_price_per_ton=$17,
       total_sum=$18, comment=$19
     WHERE id=$20`,
    [
      data.date,
      data.client_id,
      data.zavod_id,
      data.cement_mark_id,
      data.packaging,
      incomingId,
      data.tonnage,
      data.sale_price_per_ton,
      data.price_per_ton,
      data.price_per_ton! * data.tonnage,
      marginTotal,
      data.vehicle_type,
      data.vehicle_type === 'OWN' ? data.own_vehicle_id : null,
      data.vehicle_type === 'OWN' ? null : data.sale_machine_number ?? null,
      data.vehicle_type === 'HIRED' ? data.carrier_name : null,
      data.vehicle_type === 'CLIENT' ? null : data.freight_price_per_ton,
      data.vehicle_type === 'HIRED' ? data.hire_price_per_ton : null,
      saleTotal,
      data.comment ?? null,
      saleId,
    ],
  );
}

export async function createIncoming(client: pg.PoolClient, data: IncomingInput) {
  const totalSum = data.tonnage * data.price_per_ton;
  const { rows } = await client.query(
    `INSERT INTO incoming (date, warehouse, zavod_id, cement_mark_id, packaging, tonnage, price_per_ton, total_sum, machine_number, comment, client_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      data.date,
      data.warehouse,
      data.zavod_id,
      data.cement_mark_id,
      data.packaging,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.machine_number ?? null,
      data.comment ?? null,
      data.warehouse === 'CLIENT_GOODS' ? data.client_id : null,
    ],
  );
  const incoming = rows[0];

  if (data.warehouse === 'DIRECT') {
    const saleId = await insertLinkedSale(client, incoming.id, data);
    await client.query('UPDATE incoming SET linked_sale_id = $1 WHERE id = $2', [saleId, incoming.id]);
    incoming.linked_sale_id = saleId;
  } else {
    // FACT и CLIENT_GOODS одинаково пополняют остаток склада (раздел 9.2 ТЗ).
    await recomputeWarehouseBalance(client, data.zavod_id, data.cement_mark_id, data.packaging);
  }
  return incoming;
}

export async function updateIncoming(client: pg.PoolClient, id: number, data: IncomingInput) {
  const { rows: existingRows } = await client.query('SELECT * FROM incoming WHERE id = $1 FOR UPDATE', [id]);
  const existing = existingRows[0];
  if (!existing) throw notFound('Приход не найден');

  const totalSum = data.tonnage * data.price_per_ton;
  const { rows } = await client.query(
    `UPDATE incoming SET date=$1, warehouse=$2, zavod_id=$3, cement_mark_id=$4, packaging=$5,
       tonnage=$6, price_per_ton=$7, total_sum=$8, machine_number=$9, comment=$10, client_id=$11
     WHERE id=$12 RETURNING *`,
    [
      data.date,
      data.warehouse,
      data.zavod_id,
      data.cement_mark_id,
      data.packaging,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.machine_number ?? null,
      data.comment ?? null,
      data.warehouse === 'CLIENT_GOODS' ? data.client_id : null,
      id,
    ],
  );
  const updated = rows[0];

  const wasDirect = existing.warehouse === 'DIRECT';
  const isDirect = data.warehouse === 'DIRECT';

  if (wasDirect && isDirect && existing.linked_sale_id) {
    await updateLinkedSale(client, existing.linked_sale_id, id, data);
    updated.linked_sale_id = existing.linked_sale_id;
  } else if (isDirect && !wasDirect) {
    const saleId = await insertLinkedSale(client, id, data);
    await client.query('UPDATE incoming SET linked_sale_id = $1 WHERE id = $2', [saleId, id]);
    updated.linked_sale_id = saleId;
  } else if (!isDirect && wasDirect && existing.linked_sale_id) {
    await client.query('DELETE FROM sales WHERE id = $1', [existing.linked_sale_id]);
    await client.query('UPDATE incoming SET linked_sale_id = NULL WHERE id = $1', [id]);
    updated.linked_sale_id = null;
  }

  // DIRECT не трогает склад Факт вовсе — пересчёт нужен только там, где строка была или стала FACT.
  if (!wasDirect) {
    await recomputeWarehouseBalance(client, existing.zavod_id, existing.cement_mark_id, existing.packaging);
  }
  if (!isDirect) {
    await recomputeWarehouseBalance(client, data.zavod_id, data.cement_mark_id, data.packaging);
  }
  return updated;
}

export async function deleteIncoming(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM incoming WHERE id = $1 FOR UPDATE', [id]);
  const deleted = rows[0];
  if (!deleted) throw notFound('Приход не найден');

  if (deleted.warehouse === 'DIRECT' && deleted.linked_sale_id) {
    await client.query('UPDATE incoming SET linked_sale_id = NULL WHERE id = $1', [id]);
    await client.query('DELETE FROM sales WHERE id = $1', [deleted.linked_sale_id]);
  }
  await client.query('DELETE FROM incoming WHERE id = $1', [id]);
  if (deleted.warehouse === 'FACT' || deleted.warehouse === 'CLIENT_GOODS') {
    await recomputeWarehouseBalance(client, deleted.zavod_id, deleted.cement_mark_id, deleted.packaging);
  }
}
