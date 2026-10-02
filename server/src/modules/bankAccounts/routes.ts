import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  bank_name: z.string().trim().min(1, 'Укажите название банка'),
  account_number: z.string().trim().min(1, 'Укажите номер счёта'),
  display_name: z.string().trim().min(1, 'Укажите название для отображения'),
  initial_balance: z.coerce.number().default(0),
  currency: z.enum(['UZS', 'USD']).default('UZS'),
  active: z.coerce.boolean().default(true),
});

// balance не в списке колонок — ведётся транзакционно модулем cashService, не правится напрямую
// (см. applyBankAccountOperation). initial_balance на создании счёта используется как стартовый
// balance — см. createCashServiceOp... нет, баланс стартует с initial_balance ещё при создании
// счёта самим createRefRouter (см. схему таблицы: balance по умолчанию берёт initial_balance).
export const bankAccountsRouter = createRefRouter({
  table: 'bank_accounts',
  columns: ['bank_name', 'account_number', 'display_name', 'initial_balance', 'currency', 'active'],
  schema,
  searchColumn: 'display_name',
});
