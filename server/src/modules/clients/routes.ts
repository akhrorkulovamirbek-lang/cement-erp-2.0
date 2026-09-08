import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите имя клиента'),
  phone: z.string().trim().optional().nullable().default(null),
});

export const clientsRouter = createRefRouter({
  table: 'clients',
  columns: ['name', 'phone'],
  schema,
  searchColumn: 'name',
});
