import type pg from 'pg';
import { conflict } from '../../lib/errors.js';

export type BrokerOpType = 'replenish' | 'ticket_purchase' | 'ticket_return';

/** Positive amount always; sign of the effect on balance is derived from `type`. */
export async function applyBrokerOperation(
  client: pg.PoolClient,
  params: { date: string; type: BrokerOpType; amount: number; description?: string; relatedTicketId?: number },
) {
  const delta = params.type === 'ticket_purchase' ? -params.amount : params.amount;

  const { rows: accRows } = await client.query('SELECT balance FROM broker_account WHERE id = 1 FOR UPDATE');
  const currentBalance = Number(accRows[0].balance);
  const newBalance = currentBalance + delta;
  if (newBalance < -1e-6) {
    throw conflict('Недостаточно средств на брокерском счёте');
  }

  await client.query('UPDATE broker_account SET balance = $1, updated_at = now() WHERE id = 1', [newBalance]);
  const { rows } = await client.query(
    `INSERT INTO broker_operations (date, type, amount, description, related_ticket_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [params.date, params.type, params.amount, params.description ?? null, params.relatedTicketId ?? null],
  );
  return rows[0];
}
