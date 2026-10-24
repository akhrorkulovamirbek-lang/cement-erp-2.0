import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

// Завод-производитель цемента. Не контрагент: расчётов и долгов с ним нет, это справочник для учёта,
// с какого завода пришёл цемент (расчёты ведутся с поставщиком — таблица zavody в базе).
const schema = z.object({
  name: z.string().trim().min(1, 'Укажите название завода'),
  region: z.string().trim().optional().nullable().default(null),
  comment: z.string().trim().optional().nullable().default(null),
  active: z.coerce.boolean().default(true),
});

export const factoriesRouter = createRefRouter({
  table: 'factories',
  columns: ['name', 'region', 'comment', 'active'],
  schema,
  searchColumn: 'name',
});
