import { z } from 'zod';

export const logisticsSchema = z.object({
  date: z.string().min(1),
  machine_number: z.string().trim().min(1, 'Укажите номер машины'),
  machine_own: z.coerce.boolean().default(true),
  tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),
  price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
  client_id: z.coerce.number().int().positive().optional().nullable(),
});
