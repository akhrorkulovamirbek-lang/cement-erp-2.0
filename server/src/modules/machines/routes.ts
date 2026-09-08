import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  number: z.string().trim().min(1, 'Укажите номер машины'),
});

export const machinesRouter = createRefRouter({
  table: 'machines',
  columns: ['number'],
  schema,
  searchColumn: 'number',
});
