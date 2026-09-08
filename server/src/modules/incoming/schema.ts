import { z } from 'zod';

export const incomingSchema = z.object({
  date: z.string().min(1),
  machine_number: z.string().trim().min(1, 'Укажите номер машины'),
  machine_own: z.coerce.boolean().default(true),
  cement_mark_id: z.coerce.number().int().positive('Выберите марку цемента'),
  type: z.enum(['рассыпной', 'мешок']),
  tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),
  price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
  zavod_id: z.coerce.number().int().positive('Выберите завод'),
  warehouse_received: z.coerce.boolean().default(true),
});
