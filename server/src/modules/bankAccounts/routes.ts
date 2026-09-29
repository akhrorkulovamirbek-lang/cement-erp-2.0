import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  bank_name: z.string().trim().min(1, 'Укажите название банка'),
  account_number: z.string().trim().min(1, 'Укажите номер счёта'),
  display_name: z.string().trim().min(1, 'Укажите название для отображения'),
  initial_balance: z.coerce.number().default(0),
  active: z.coerce.boolean().default(true),
});

export const bankAccountsRouter = createRefRouter({
  table: 'bank_accounts',
  columns: ['bank_name', 'account_number', 'display_name', 'initial_balance', 'active'],
  schema,
  searchColumn: 'display_name',
});
