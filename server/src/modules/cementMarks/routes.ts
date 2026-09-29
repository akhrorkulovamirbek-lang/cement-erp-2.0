import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите марку цемента'),
  active: z.coerce.boolean().default(true),
});

export const cementMarksRouter = createRefRouter({
  table: 'cement_marks',
  columns: ['name', 'active'],
  schema,
  searchColumn: 'name',
});
