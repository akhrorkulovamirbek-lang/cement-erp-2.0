import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

// Раздел 1 ТЗ: госномер хранится в одном формате — заглавные буквы и цифры без пробелов.
const plateNumber = z
  .string()
  .trim()
  .min(1, 'Укажите госномер')
  .transform((v) => v.replace(/\s+/g, '').toUpperCase());

const schema = z.object({
  number: plateNumber,
  model: z.string().trim().optional().nullable().default(null),
  driver: z.string().trim().optional().nullable().default(null),
  capacity_tons: z.coerce.number().optional().nullable().default(null),
  active: z.coerce.boolean().default(true),
});

export const machinesRouter = createRefRouter({
  table: 'machines',
  columns: ['number', 'model', 'driver', 'capacity_tons', 'active'],
  schema,
  searchColumn: 'number',
});
