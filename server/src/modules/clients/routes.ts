import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите имя клиента'),
  phone: z.string().trim().optional().nullable().default(null),
  contact_person: z.string().trim().optional().nullable().default(null),
  inn: z.string().trim().optional().nullable().default(null),
  initial_debt: z.coerce.number().default(0),
  comment: z.string().trim().optional().nullable().default(null),
  active: z.coerce.boolean().default(true),
});

export const clientsRouter = createRefRouter({
  table: 'clients',
  columns: ['name', 'phone', 'contact_person', 'inn', 'initial_debt', 'comment', 'active'],
  schema,
  searchColumn: 'name',
});
