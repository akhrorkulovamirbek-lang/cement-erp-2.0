import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите название завода'),
  region: z.string().trim().optional().nullable().default(null),
  phone: z.string().trim().optional().nullable().default(null),
  initial_debt: z.coerce.number().default(0),
  active: z.coerce.boolean().default(true),
});

export const zavodyRouter = createRefRouter({
  table: 'zavody',
  columns: ['name', 'region', 'phone', 'initial_debt', 'active'],
  schema,
  searchColumn: 'name',
});
