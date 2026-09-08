import type pg from 'pg';
import { conflict, notFound } from '../../lib/errors.js';
import { applyBrokerOperation } from '../broker/service.js';
import type { z } from 'zod';
import type { createTicketSchema, updateTicketSchema } from './schema.js';

type CreateTicketInput = z.infer<typeof createTicketSchema>;
type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export async function createTicket(client: pg.PoolClient, data: CreateTicketInput) {
  const boughtSum = data.tonnage * data.price_per_ton;

  const { rows } = await client.query(
    `INSERT INTO tickets (date, ticket_number, zavod_id, cement_mark_id, bought_tonnage, price_per_ton, bought_sum, remaining_tonnage, remaining_sum, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $5, $7, 'active') RETURNING *`,
    [data.date, data.ticket_number, data.zavod_id, data.cement_mark_id, data.tonnage, data.price_per_ton, boughtSum],
  );
  const ticket = rows[0];

  await applyBrokerOperation(client, {
    date: data.date,
    type: 'ticket_purchase',
    amount: boughtSum,
    description: `Покупка тикета ${data.ticket_number}`,
    relatedTicketId: ticket.id,
  });

  return ticket;
}

/** Recalculates cost_per_ton/cost_total/margin_total for every sale made from this ticket. */
async function recomputeTicketSales(client: pg.PoolClient, ticketId: number, pricePerTon: number) {
  await client.query(
    `UPDATE sales SET cost_per_ton = $1, cost_total = $1 * tonnage, margin_total = total_sum - ($1 * tonnage)
     WHERE source = 'ticket' AND ticket_id = $2`,
    [pricePerTon, ticketId],
  );
}

export async function updateTicket(client: pg.PoolClient, id: number, data: UpdateTicketInput) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
  const ticket = rows[0];
  if (!ticket) throw notFound('Тикет не найден');

  const oldPrice = Number(ticket.price_per_ton);
  const boughtTonnage = Number(ticket.bought_tonnage);
  const remainingTonnage = Number(ticket.remaining_tonnage);
  const newPrice = data.price_per_ton;
  const newBoughtSum = boughtTonnage * newPrice;
  const newRemainingSum = remainingTonnage * newPrice;

  if (newPrice !== oldPrice) {
    const delta = newBoughtSum - boughtTonnage * oldPrice;
    if (delta > 0) {
      await applyBrokerOperation(client, {
        date: new Date().toISOString().slice(0, 10),
        type: 'ticket_purchase',
        amount: delta,
        description: `Корректировка цены тикета ${ticket.ticket_number}`,
        relatedTicketId: id,
      });
    } else if (delta < 0) {
      await applyBrokerOperation(client, {
        date: new Date().toISOString().slice(0, 10),
        type: 'ticket_return',
        amount: -delta,
        description: `Корректировка цены тикета ${ticket.ticket_number}`,
        relatedTicketId: id,
      });
    }
    await recomputeTicketSales(client, id, newPrice);
  }

  const { rows: updated } = await client.query(
    `UPDATE tickets SET ticket_number = $1, zavod_id = $2, cement_mark_id = $3, price_per_ton = $4, bought_sum = $5, remaining_sum = $6
     WHERE id = $7 RETURNING *`,
    [data.ticket_number, data.zavod_id, data.cement_mark_id, newPrice, newBoughtSum, newRemainingSum, id],
  );
  return updated[0];
}

export async function closeTicket(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
  const ticket = rows[0];
  if (!ticket) throw notFound('Тикет не найден');
  if (ticket.status === 'closed') throw conflict('Тикет уже закрыт');

  const remainingSum = Number(ticket.remaining_sum);
  if (remainingSum > 1e-6) {
    await applyBrokerOperation(client, {
      date: new Date().toISOString().slice(0, 10),
      type: 'ticket_return',
      amount: remainingSum,
      description: `Возврат остатка по тикету ${ticket.ticket_number}`,
      relatedTicketId: id,
    });
  }

  const { rows: updated } = await client.query(
    `UPDATE tickets SET remaining_tonnage = 0, remaining_sum = 0, status = 'closed', manually_closed = true WHERE id = $1 RETURNING *`,
    [id],
  );
  return updated[0];
}

export async function deleteTicket(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
  const ticket = rows[0];
  if (!ticket) throw notFound('Тикет не найден');
  if (Number(ticket.remaining_tonnage) !== Number(ticket.bought_tonnage)) {
    throw conflict('Нельзя удалить тикет — с него уже были продажи');
  }

  await applyBrokerOperation(client, {
    date: new Date().toISOString().slice(0, 10),
    type: 'ticket_return',
    amount: Number(ticket.bought_sum),
    description: `Удаление тикета ${ticket.ticket_number}`,
    relatedTicketId: id,
  });

  await client.query('DELETE FROM tickets WHERE id = $1', [id]);
}
