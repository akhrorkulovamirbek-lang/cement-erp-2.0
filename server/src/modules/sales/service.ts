import type pg from 'pg';
import type { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { recomputeWarehouseBalance } from '../warehouse/service.js';
import type { saleSchema } from './schema.js';

type SaleInput = z.infer<typeof saleSchema>;

async function isManuallyClosed(client: pg.PoolClient, ticketId: number): Promise<boolean> {
  const { rows } = await client.query('SELECT manually_closed FROM tickets WHERE id = $1', [ticketId]);
  return Boolean(rows[0]?.manually_closed);
}

function computeLogisticsTotal(data: SaleInput) {
  return data.has_logistics ? data.tonnage * (data.logistics_price_per_ton ?? 0) : null;
}

export async function createSale(client: pg.PoolClient, data: SaleInput) {
  const totalSum = data.tonnage * data.price_per_ton;
  let costPerTon = 0;
  let cementMarkId = data.cement_mark_id;

  if (data.source === 'ticket') {
    const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [data.ticket_id]);
    const ticket = rows[0];
    if (!ticket) throw notFound('Тикет не найден');
    if (ticket.status === 'closed') throw conflict('Тикет закрыт — продажа с него невозможна');
    if (Number(ticket.remaining_tonnage) + 1e-6 < data.tonnage) {
      throw conflict('Недостаточно остатка тикета для этой продажи');
    }
    costPerTon = Number(ticket.price_per_ton);
    // The ticket is the source of truth for which mark was bought — never trust the client for this.
    cementMarkId = ticket.cement_mark_id;
  }

  const costTotal = costPerTon * data.tonnage;
  const marginTotal = totalSum - costTotal;
  const logisticsTotal = computeLogisticsTotal(data);

  const { rows: saleRows } = await client.query(
    `INSERT INTO sales (date, client_id, cement_mark_id, type, tonnage, price_per_ton, total_sum, currency, usd_rate,
        source, ticket_id, cost_per_ton, cost_total, margin_total, has_logistics, machine_number, machine_own,
        logistics_price_per_ton, logistics_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [
      data.date,
      data.client_id,
      cementMarkId,
      data.type,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.currency,
      data.usd_rate ?? null,
      data.source,
      data.source === 'ticket' ? data.ticket_id : null,
      costPerTon,
      costTotal,
      marginTotal,
      data.has_logistics,
      data.machine_number ?? null,
      data.machine_own ?? null,
      data.logistics_price_per_ton ?? null,
      logisticsTotal,
    ],
  );

  if (data.source === 'warehouse') {
    // Validates against negative stock and fills in the real moving-average cost/margin.
    await recomputeWarehouseBalance(client, data.cement_mark_id, data.type);
  } else {
    await deductTicket(client, data.ticket_id!, data.tonnage);
  }

  const { rows: finalRow } = await client.query('SELECT * FROM sales WHERE id = $1', [saleRows[0].id]);
  return finalRow[0];
}

async function deductTicket(client: pg.PoolClient, ticketId: number, tonnage: number) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
  const ticket = rows[0];
  const newRemainingTonnage = Math.max(Number(ticket.remaining_tonnage) - tonnage, 0);
  const newRemainingSum = newRemainingTonnage * Number(ticket.price_per_ton);
  const status = newRemainingTonnage <= 1e-6 ? 'closed' : 'active';
  await client.query('UPDATE tickets SET remaining_tonnage = $1, remaining_sum = $2, status = $3 WHERE id = $4', [
    newRemainingTonnage,
    newRemainingSum,
    status,
    ticketId,
  ]);
}

async function restoreTicket(client: pg.PoolClient, ticketId: number, tonnage: number) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
  const ticket = rows[0];
  if (!ticket) return;
  const restoredTonnage = Number(ticket.remaining_tonnage) + tonnage;
  const restoredSum = restoredTonnage * Number(ticket.price_per_ton);
  await client.query(`UPDATE tickets SET remaining_tonnage = $1, remaining_sum = $2, status = 'active' WHERE id = $3`, [
    restoredTonnage,
    restoredSum,
    ticketId,
  ]);
}

export async function updateSale(client: pg.PoolClient, id: number, data: SaleInput) {
  const { rows: existingRows } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
  const existing = existingRows[0];
  if (!existing) throw notFound('Продажа не найдена');

  if (existing.source === 'ticket' && existing.ticket_id && (await isManuallyClosed(client, existing.ticket_id))) {
    throw conflict('Нельзя изменить продажу — тикет был закрыт вручную с возвратом остатка на биржу');
  }

  if (existing.source === 'ticket' && existing.ticket_id) {
    await restoreTicket(client, existing.ticket_id, Number(existing.tonnage));
  }

  let costPerTon = 0;
  let cementMarkId = data.cement_mark_id;
  if (data.source === 'ticket') {
    const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [data.ticket_id]);
    const ticket = rows[0];
    if (!ticket) throw notFound('Тикет не найден');
    if (Number(ticket.remaining_tonnage) + 1e-6 < data.tonnage) {
      throw conflict('Недостаточно остатка тикета для этой продажи');
    }
    costPerTon = Number(ticket.price_per_ton);
    cementMarkId = ticket.cement_mark_id;
  }

  const totalSum = data.tonnage * data.price_per_ton;
  const costTotal = costPerTon * data.tonnage;
  const marginTotal = totalSum - costTotal;
  const logisticsTotal = computeLogisticsTotal(data);

  await client.query(
    `UPDATE sales SET date=$1, client_id=$2, cement_mark_id=$3, type=$4, tonnage=$5, price_per_ton=$6, total_sum=$7,
       currency=$8, usd_rate=$9, source=$10, ticket_id=$11, cost_per_ton=$12, cost_total=$13, margin_total=$14,
       has_logistics=$15, machine_number=$16, machine_own=$17, logistics_price_per_ton=$18, logistics_total=$19
     WHERE id=$20`,
    [
      data.date,
      data.client_id,
      cementMarkId,
      data.type,
      data.tonnage,
      data.price_per_ton,
      totalSum,
      data.currency,
      data.usd_rate ?? null,
      data.source,
      data.source === 'ticket' ? data.ticket_id : null,
      costPerTon,
      costTotal,
      marginTotal,
      data.has_logistics,
      data.machine_number ?? null,
      data.machine_own ?? null,
      data.logistics_price_per_ton ?? null,
      logisticsTotal,
      id,
    ],
  );

  if (data.source === 'ticket') {
    await deductTicket(client, data.ticket_id!, data.tonnage);
  }

  if (existing.source === 'warehouse') {
    await recomputeWarehouseBalance(client, existing.cement_mark_id, existing.type);
  }
  if (
    data.source === 'warehouse' &&
    (existing.source !== 'warehouse' || existing.cement_mark_id !== cementMarkId || existing.type !== data.type)
  ) {
    await recomputeWarehouseBalance(client, cementMarkId, data.type);
  }

  const { rows: finalRows } = await client.query('SELECT * FROM sales WHERE id = $1', [id]);
  return finalRows[0];
}

export async function deleteSale(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
  const sale = rows[0];
  if (!sale) throw notFound('Продажа не найдена');

  if (sale.source === 'ticket' && sale.ticket_id) {
    if (await isManuallyClosed(client, sale.ticket_id)) {
      throw conflict('Нельзя удалить продажу — тикет был закрыт вручную с возвратом остатка на биржу');
    }
    await restoreTicket(client, sale.ticket_id, Number(sale.tonnage));
  }

  await client.query('DELETE FROM sales WHERE id = $1', [id]);

  if (sale.source === 'warehouse') {
    await recomputeWarehouseBalance(client, sale.cement_mark_id, sale.type);
  }
}
