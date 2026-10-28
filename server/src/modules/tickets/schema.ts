import { z } from 'zod';
import { PACKAGING_TYPES } from '../../core/constants.js';

export const createTicketSchema = z.object({
  date: z.string().min(1),
  ticket_number: z.string().trim().min(1, 'Укажите номер тикета'),
  // Поставщик у тикета не указывается: цемент приходует завод. Поле оставлено необязательным для старых клиентов.
  zavod_id: z.coerce.number().int().positive().optional().nullable(),
  factory_id: z.coerce.number({ invalid_type_error: 'Выберите завод' }).int().positive('Выберите завод'),
  cement_mark_id: z.coerce.number().int().positive('Выберите марку цемента'),
  packaging: z.enum(PACKAGING_TYPES),
  tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),
  price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
});

export const updateTicketSchema = z.object({
  ticket_number: z.string().trim().min(1, 'Укажите номер тикета'),
  // Поставщик у тикета не указывается: цемент приходует завод. Поле оставлено необязательным для старых клиентов.
  zavod_id: z.coerce.number().int().positive().optional().nullable(),
  factory_id: z.coerce.number({ invalid_type_error: 'Выберите завод' }).int().positive('Выберите завод'),
  cement_mark_id: z.coerce.number().int().positive('Выберите марку цемента'),
  price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
});
