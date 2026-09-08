import { z } from 'zod';

export const saleSchema = z
  .object({
    date: z.string().min(1),
    client_id: z.coerce.number().int().positive('Выберите клиента'),
    cement_mark_id: z.coerce.number().int().positive('Выберите марку цемента'),
    type: z.enum(['рассыпной', 'мешок']),
    tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),
    price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    usd_rate: z.coerce.number().positive().optional().nullable(),
    source: z.enum(['warehouse', 'ticket']),
    ticket_id: z.coerce.number().int().positive().optional().nullable(),
    has_logistics: z.coerce.boolean().default(false),
    machine_number: z.string().trim().optional().nullable(),
    machine_own: z.coerce.boolean().optional().nullable(),
    logistics_price_per_ton: z.coerce.number().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
    if (data.source === 'ticket' && !data.ticket_id) {
      ctx.addIssue({ code: 'custom', path: ['ticket_id'], message: 'Выберите тикет' });
    }
    if (data.has_logistics) {
      if (!data.machine_number) {
        ctx.addIssue({ code: 'custom', path: ['machine_number'], message: 'Укажите номер машины' });
      }
      if (!data.logistics_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['logistics_price_per_ton'], message: 'Укажите цену логистики' });
      }
    }
  });
