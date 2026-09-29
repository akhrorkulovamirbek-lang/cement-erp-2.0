import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите название категории'),
  active: z.coerce.boolean().default(true),
});

export const logisticsExpenseCategoriesRouter = createRefRouter({
  table: 'logistics_expense_categories',
  columns: ['name', 'active'],
  schema,
  searchColumn: 'name',
});
