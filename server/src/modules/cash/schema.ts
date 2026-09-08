import { z } from 'zod';

const currencyFields = {
  currency: z.enum(['UZS', 'USD']).default('UZS'),
  usd_rate: z.coerce.number().positive().optional().nullable(),
};

export const cashIncomeSchema = z
  .object({
    date: z.string().min(1),
    category: z.enum(['цемент', 'логистика', 'возврат_биржи', 'прочее']),
    client_id: z.coerce.number().int().positive().optional().nullable(),
    amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
    payment_type: z.enum(['перечисление', 'наличка', 'карта']),
    comment: z.string().trim().optional().nullable(),
    related_sale_id: z.coerce.number().int().positive().optional().nullable(),
    ...currencyFields,
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
  });

export const cashExpenseSchema = z
  .object({
    date: z.string().min(1),
    category: z.enum(['цемент', 'логистика', 'прочее']),
    machine_number: z.string().trim().optional().nullable(),
    zavod_id: z.coerce.number().int().positive().optional().nullable(),
    expense_type: z.string().trim().min(1, 'Укажите тип расхода'),
    amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
    payment_type: z.enum(['перечисление', 'наличка', 'карта']),
    comment: z.string().trim().optional().nullable(),
    ...currencyFields,
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
  });
