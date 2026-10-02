import { z } from 'zod';

export const cashServiceSchema = z
  .object({
    date: z.string().min(1),
    bank_account_id: z.coerce.number().int().positive('Выберите банковский счёт'),
    counterparty_name: z.string().trim().optional().nullable(),
    counterparty_phone: z.string().trim().optional().nullable(),
    transfer_amount: z.coerce.number().positive('Укажите сумму перевода'),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    usd_rate: z.coerce.number().positive().optional().nullable(),
    commission_amount: z.coerce.number().min(0, 'Комиссия не может быть отрицательной').default(0),
    comment: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
    if (data.commission_amount > data.transfer_amount) {
      ctx.addIssue({ code: 'custom', path: ['commission_amount'], message: 'Комиссия не может быть больше суммы перевода' });
    }
  });
