import type pg from 'pg';
import type { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import type { cashServiceSchema } from './schema.js';

type CashServiceInput = z.infer<typeof cashServiceSchema>;

function payoutComment(counterpartyName: string | null | undefined): string {
  return counterpartyName ? `Выдача по обналичиванию — ${counterpartyName}` : 'Выдача по обналичиванию';
}

/** Баланс счёта — не дельта-учёт, а полный переигрыш (initial_balance + Σ transfer_amount по
 * его операциям), тот же подход, что и recomputeWarehouseBalance в warehouse/service.ts —
 * безопаснее ручной дельта-арифметики при правках/удалении задним числом. */
export async function recomputeBankAccountBalance(client: pg.PoolClient, bankAccountId: number) {
  const { rows } = await client.query(
    `SELECT ba.initial_balance, COALESCE(SUM(cso.transfer_amount), 0) AS total
     FROM bank_accounts ba
     LEFT JOIN cash_service_operations cso ON cso.bank_account_id = ba.id
     WHERE ba.id = $1
     GROUP BY ba.id, ba.initial_balance`,
    [bankAccountId],
  );
  const row = rows[0];
  if (!row) return;
  const balance = Number(row.initial_balance) + Number(row.total);
  await client.query('UPDATE bank_accounts SET balance = $1 WHERE id = $2', [balance, bankAccountId]);
}

async function lockBankAccount(client: pg.PoolClient, bankAccountId: number) {
  const { rows } = await client.query('SELECT * FROM bank_accounts WHERE id = $1 FOR UPDATE', [bankAccountId]);
  const account = rows[0];
  if (!account) throw notFound('Банковский счёт не найден');
  return account;
}

export async function createCashServiceOp(client: pg.PoolClient, data: CashServiceInput) {
  const account = await lockBankAccount(client, data.bank_account_id);
  if (account.currency !== data.currency) {
    throw conflict(`Валюта операции должна совпадать с валютой счёта (${account.currency})`);
  }
  const payoutAmount = data.transfer_amount - data.commission_amount;

  const { rows: expenseRows } = await client.query(
    `INSERT INTO cash_expense (date, category, machine_number, zavod_id, carrier_name, expense_type, amount, currency, usd_rate, payment_type, comment)
     VALUES ($1,'обналичивание',NULL,NULL,NULL,NULL,$2,$3,$4,'наличка',$5) RETURNING id`,
    [data.date, payoutAmount, data.currency, data.currency === 'USD' ? data.usd_rate : null, payoutComment(data.counterparty_name)],
  );
  const cashExpenseId = expenseRows[0].id as number;

  const { rows } = await client.query(
    `INSERT INTO cash_service_operations
       (date, bank_account_id, counterparty_name, counterparty_phone, transfer_amount, currency, usd_rate,
        commission_amount, payout_amount, related_cash_expense_id, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      data.date,
      data.bank_account_id,
      data.counterparty_name ?? null,
      data.counterparty_phone ?? null,
      data.transfer_amount,
      data.currency,
      data.currency === 'USD' ? data.usd_rate : null,
      data.commission_amount,
      payoutAmount,
      cashExpenseId,
      data.comment ?? null,
    ],
  );

  await recomputeBankAccountBalance(client, data.bank_account_id);
  return rows[0];
}

export async function updateCashServiceOp(client: pg.PoolClient, id: number, data: CashServiceInput) {
  const { rows: existingRows } = await client.query('SELECT * FROM cash_service_operations WHERE id = $1 FOR UPDATE', [id]);
  const existing = existingRows[0];
  if (!existing) throw notFound('Операция не найдена');

  const account = await lockBankAccount(client, data.bank_account_id);
  if (account.currency !== data.currency) {
    throw conflict(`Валюта операции должна совпадать с валютой счёта (${account.currency})`);
  }
  const payoutAmount = data.transfer_amount - data.commission_amount;

  if (existing.related_cash_expense_id) {
    await client.query(`UPDATE cash_expense SET date=$1, amount=$2, currency=$3, usd_rate=$4, comment=$5 WHERE id=$6`, [
      data.date,
      payoutAmount,
      data.currency,
      data.currency === 'USD' ? data.usd_rate : null,
      payoutComment(data.counterparty_name),
      existing.related_cash_expense_id,
    ]);
  }

  await client.query(
    `UPDATE cash_service_operations SET date=$1, bank_account_id=$2, counterparty_name=$3, counterparty_phone=$4,
       transfer_amount=$5, currency=$6, usd_rate=$7, commission_amount=$8, payout_amount=$9, comment=$10
     WHERE id=$11`,
    [
      data.date,
      data.bank_account_id,
      data.counterparty_name ?? null,
      data.counterparty_phone ?? null,
      data.transfer_amount,
      data.currency,
      data.currency === 'USD' ? data.usd_rate : null,
      data.commission_amount,
      payoutAmount,
      data.comment ?? null,
      id,
    ],
  );

  await recomputeBankAccountBalance(client, existing.bank_account_id);
  if (existing.bank_account_id !== data.bank_account_id) {
    await recomputeBankAccountBalance(client, data.bank_account_id);
  }

  const { rows: finalRows } = await client.query('SELECT * FROM cash_service_operations WHERE id = $1', [id]);
  return finalRows[0];
}

export async function deleteCashServiceOp(client: pg.PoolClient, id: number) {
  const { rows } = await client.query('SELECT * FROM cash_service_operations WHERE id = $1 FOR UPDATE', [id]);
  const existing = rows[0];
  if (!existing) throw notFound('Операция не найдена');

  await client.query('DELETE FROM cash_service_operations WHERE id = $1', [id]);
  if (existing.related_cash_expense_id) {
    await client.query('DELETE FROM cash_expense WHERE id = $1', [existing.related_cash_expense_id]);
  }
  await recomputeBankAccountBalance(client, existing.bank_account_id);
}
