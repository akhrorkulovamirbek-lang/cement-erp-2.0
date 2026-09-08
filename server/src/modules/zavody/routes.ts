import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите название завода'),
});

export const zavodyRouter = createRefRouter({
  table: 'zavody',
  columns: ['name'],
  schema,
  searchColumn: 'name',
});
