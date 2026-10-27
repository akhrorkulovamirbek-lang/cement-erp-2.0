import { z } from 'zod';
import { createRefRouter } from '../../lib/refModule.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Укажите имя клиента'),
  phone: z.string().trim().optional().nullable().default(null),
  contact_person: z.string().trim().optional().nullable().default(null),
  inn: z.string().trim().optional().nullable().default(null),
  initial_debt: z.coerce.number().default(0),
  comment: z.string().trim().optional().nullable().default(null),
  // Ник в Телеграме: принимаем «@name», «name» и ссылку t.me/name; храним строчными без @.
  telegram_username: z
    .string()
    .trim()
    .optional()
    .nullable()
    .default(null)
    .transform((v) => (v ? v.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').toLowerCase() : null))
    .refine((v) => v === null || /^[a-z0-9_]{5,32}$/.test(v), 'Ник в Телеграме: латинские буквы, цифры и «_», от 5 знаков'),
  is_supplier: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
});

export const clientsRouter = createRefRouter({
  table: 'clients',
  columns: ['name', 'phone', 'contact_person', 'inn', 'initial_debt', 'comment', 'telegram_username', 'is_supplier', 'active'],
  schema,
  searchColumn: 'name',
});
