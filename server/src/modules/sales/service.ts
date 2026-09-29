import type pg from 'pg';
import type { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { computeFreightTotal, type VehicleType } from '../../lib/pricing.js';
import { recomputeWarehouseBalance } from '../warehouse/service.js';
import type { saleSchema } from './schema.js';

type SaleInput = z.infer<typeof saleSchema>;

async function isManuallyClosed(client: pg.PoolClient, ticketId: number): Promise<boolean> {
  const { rows } = await client.query('SELECT manually_closed FROM tickets WHERE id = $1', [ticketId]);
  return Boolean(rows[0]?.manually_closed);
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

/** Раздел 3 ТЗ (Логистика, п.3): своя/наёмная определяется по совпадению номера со справочником
 * «Свои машины» — сервер решает это сам, не доверяя presented vehicle_type от клиента. */
async function resolveLogisticsVehicle(client: pg.PoolClient, machineNumber: string) {
  const normalized = machineNumber.replace(/\s+/g, '').toUpperCase();
  const { rows } = await client.query('SELECT id FROM machines WHERE number = $1 AND active = true', [normalized]);
  if (rows[0]) return { vehicleType: 'OWN' as VehicleType, ownVehicleId: rows[0].id as number, machineNumber: normalized };
  return { vehicleType: 'HIRED' as VehicleType, ownVehicleId: null as number | null, machineNumber: normalized };
}

interface CementSource {
  zavodId: number;
  cementMarkId: number;
  packaging: string;
  costPerTon: number;
}

async function resolveCementSource(client: pg.PoolClient, data: SaleInput): Promise<CementSource> {
  if (data.source === 'ticket') {
    const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [data.ticket_id]);
    const ticket = rows[0];
    if (!ticket) throw notFound('Тикет не найден');
    if (ticket.status === 'closed') throw conflict('Тикет закрыт — продажа с него невозможна');
    if (Number(ticket.remaining_tonnage) + 1e-6 < data.tonnage) {
      throw conflict('Недостаточно остатка тикета для этой продажи');
    }
    return {
      zavodId: ticket.zavod_id,
      cementMarkId: ticket.cement_mark_id,
      packaging: ticket.packaging,
      costPerTon: Number(ticket.price_per_ton),
    };
  }
  return { zavodId: data.zavod_id!, cementMarkId: data.cement_mark_id!, packaging: data.packaging!, costPerTon: 0 };
}

interface VehicleColumns {
  vehicleType: VehicleType;
  ownVehicleId: number | null;
  machineNumber: string | null;
  carrierName: string | null;
  freightPricePerTon: number | null;
  hirePricePerTon: number | null;
}

async function resolveVehicle(client: pg.PoolClient, data: SaleInput): Promise<VehicleColumns> {
  if (data.sale_type === 'LOGISTICS') {
    const resolved = await resolveLogisticsVehicle(client, data.machine_number!);
    return {
      vehicleType: resolved.vehicleType,
      ownVehicleId: resolved.ownVehicleId,
      machineNumber: resolved.machineNumber,
      carrierName: resolved.vehicleType === 'HIRED' ? (data.carrier_name ?? null) : null,
      freightPricePerTon: data.freight_price_per_ton ?? null,
      hirePricePerTon: resolved.vehicleType === 'HIRED' ? (data.hire_price_per_ton ?? null) : null,
    };
  }
  return {
    vehicleType: data.vehicle_type,
    ownVehicleId: data.vehicle_type === 'OWN' ? (data.own_vehicle_id ?? null) : null,
    machineNumber: data.vehicle_type === 'OWN' ? null : (data.machine_number ?? null),
    carrierName: data.vehicle_type === 'HIRED' ? (data.carrier_name ?? null) : null,
    freightPricePerTon: data.vehicle_type === 'CLIENT' ? null : (data.freight_price_per_ton ?? null),
    hirePricePerTon: data.vehicle_type === 'HIRED' ? (data.hire_price_per_ton ?? null) : null,
  };
}

function assertEditable(existing: { source: string | null }) {
  if (existing.source === 'direct') {
    throw conflict('Эта продажа связана с приходом «Напрямую» — редактируйте и удаляйте её через Приход');
  }
}

export async function createSale(client: pg.PoolClient, data: SaleInput) {
  const vehicle = await resolveVehicle(client, data);
  const freightTotal = computeFreightTotal(vehicle.vehicleType, data.tonnage, vehicle.freightPricePerTon);

  let cement: CementSource | null = null;
  if (data.sale_type === 'CEMENT') cement = await resolveCementSource(client, data);

  const pricePerTon = data.sale_type === 'CEMENT' ? data.price_per_ton! : null;
  const totalSum = data.sale_type === 'CEMENT' ? data.tonnage * pricePerTon! + freightTotal : freightTotal;
  const costTotal = cement ? cement.costPerTon * data.tonnage : 0;
  const marginTotal = cement ? data.tonnage * pricePerTon! - costTotal : 0;

  const { rows: saleRows } = await client.query(
    `INSERT INTO sales (date, sale_type, client_id, source, zavod_id, cement_mark_id, packaging, ticket_id,
        tonnage, price_per_ton, cost_per_ton, cost_total, margin_total, vehicle_type, own_vehicle_id, machine_number,
        carrier_name, freight_price_per_ton, hire_price_per_ton, route, total_sum, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
    [
      data.date,
      data.sale_type,
      data.client_id,
      data.sale_type === 'CEMENT' ? data.source : null,
      cement?.zavodId ?? null,
      cement?.cementMarkId ?? null,
      cement?.packaging ?? null,
      data.sale_type === 'CEMENT' && data.source === 'ticket' ? data.ticket_id : null,
      data.tonnage,
      pricePerTon,
      cement?.costPerTon ?? 0,
      costTotal,
      marginTotal,
      vehicle.vehicleType,
      vehicle.ownVehicleId,
      vehicle.machineNumber,
      vehicle.carrierName,
      vehicle.freightPricePerTon,
      vehicle.hirePricePerTon,
      data.sale_type === 'LOGISTICS' ? (data.route ?? null) : null,
      totalSum,
      data.comment ?? null,
    ],
  );
  const sale = saleRows[0];

  if (data.sale_type === 'CEMENT') {
    if (data.source === 'warehouse') {
      await recomputeWarehouseBalance(client, cement!.zavodId, cement!.cementMarkId, cement!.packaging);
    } else {
      await deductTicket(client, data.ticket_id!, data.tonnage);
    }
  }

  const { rows: finalRow } = await client.query('SELECT * FROM sales WHERE id = $1', [sale.id]);
  return finalRow[0];
}

export async function updateSale(client: pg.PoolClient, id: number, data: SaleInput) {
  const { rows: existingRows } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
  const existing = existingRows[0];
  if (!existing) throw notFound('Продажа не найдена');
  assertEditable(existing);
  if (existing.sale_type !== data.sale_type) {
    throw conflict('Нельзя изменить тип продажи (Цемент/Логистика) — создайте новую продажу');
  }
  if (existing.source === 'ticket' && existing.ticket_id && (await isManuallyClosed(client, existing.ticket_id))) {
    throw conflict('Нельзя изменить продажу — тикет был закрыт вручную с возвратом остатка на биржу');
  }

  if (existing.source === 'ticket' && existing.ticket_id) {
    await restoreTicket(client, existing.ticket_id, Number(existing.tonnage));
  }

  const vehicle = await resolveVehicle(client, data);
  const freightTotal = computeFreightTotal(vehicle.vehicleType, data.tonnage, vehicle.freightPricePerTon);

  let cement: CementSource | null = null;
  if (data.sale_type === 'CEMENT') cement = await resolveCementSource(client, data);

  const pricePerTon = data.sale_type === 'CEMENT' ? data.price_per_ton! : null;
  const totalSum = data.sale_type === 'CEMENT' ? data.tonnage * pricePerTon! + freightTotal : freightTotal;
  const costTotal = cement ? cement.costPerTon * data.tonnage : 0;
  const marginTotal = cement ? data.tonnage * pricePerTon! - costTotal : 0;

  await client.query(
    `UPDATE sales SET date=$1, client_id=$2, source=$3, zavod_id=$4, cement_mark_id=$5, packaging=$6, ticket_id=$7,
       tonnage=$8, price_per_ton=$9, cost_per_ton=$10, cost_total=$11, margin_total=$12, vehicle_type=$13,
       own_vehicle_id=$14, machine_number=$15, carrier_name=$16, freight_price_per_ton=$17, hire_price_per_ton=$18,
       route=$19, total_sum=$20, comment=$21
     WHERE id=$22`,
    [
      data.date,
      data.client_id,
      data.sale_type === 'CEMENT' ? data.source : null,
      cement?.zavodId ?? null,
      cement?.cementMarkId ?? null,
      cement?.packaging ?? null,
      data.sale_type === 'CEMENT' && data.source === 'ticket' ? data.ticket_id : null,
      data.tonnage,
      pricePerTon,
      cement?.costPerTon ?? 0,
      costTotal,
      marginTotal,
      vehicle.vehicleType,
      vehicle.ownVehicleId,
      vehicle.machineNumber,
      vehicle.carrierName,
      vehicle.freightPricePerTon,
      vehicle.hirePricePerTon,
      data.sale_type === 'LOGISTICS' ? (data.route ?? null) : null,
      totalSum,
      data.comment ?? null,
      id,
    ],
  );

  if (data.sale_type === 'CEMENT' && data.source === 'ticket') {
    await deductTicket(client, data.ticket_id!, data.tonnage);
  }

  if (existing.source === 'warehouse') {
    await recomputeWarehouseBalance(client, existing.zavod_id, existing.cement_mark_id, existing.packaging);
  }
  if (
    data.sale_type === 'CEMENT' &&
    data.source === 'warehouse' &&
    (existing.source !== 'warehouse' ||
      existing.zavod_id !== cement!.zavodId ||
      existing.cement_mark_id !== cement!.cementMarkId ||
      existing.packaging !== cement!.packaging)
  ) {
    await recomputeWarehouseBalance(client, cement!.zavodId, cement!.cementMarkId, cement!.packaging);
  }

  const { rows: finalRows } = await client.query('SELECT * FROM sales WHERE id = $1', [id]);
  return finalRows[0];
}

export async function deleteSale(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
  const sale = rows[0];
  if (!sale) throw notFound('Продажа не найдена');
  assertEditable(sale);

  if (sale.source === 'ticket' && sale.ticket_id) {
    if (await isManuallyClosed(client, sale.ticket_id)) {
      throw conflict('Нельзя удалить продажу — тикет был закрыт вручную с возвратом остатка на биржу');
    }
    await restoreTicket(client, sale.ticket_id, Number(sale.tonnage));
  }

  await client.query('DELETE FROM sales WHERE id = $1', [id]);

  if (sale.source === 'warehouse') {
    await recomputeWarehouseBalance(client, sale.zavod_id, sale.cement_mark_id, sale.packaging);
  }
}
