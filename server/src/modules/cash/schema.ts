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
    // Контрагент иногда платит не от своего имени, а с другой фирмы — просто текст.
    payer_name: z.string().trim().optional().nullable(),
    // Один платёж частями в двух валютах — вторая часть, в валюте, дополняющей currency.
    extra_amount: z.coerce.number().positive('Сумма должна быть больше нуля').optional().nullable(),
    ...currencyFields,
  })
  .superRefine((data, ctx) => {
    if ((data.currency === 'USD' || data.extra_amount) && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
    if (data.category === 'цемент' && !data.client_id) {
      ctx.addIssue({ code: 'custom', path: ['client_id'], message: 'Выберите клиента' });
    }
  });

export const cashExpenseSchema = z
  .object({
    date: z.string().min(1),
    category: z.enum(['цемент', 'логистика', 'перевозчик', 'прочее']),
    machine_number: z.string().trim().optional().nullable(),
    zavod_id: z.coerce.number().int().positive().optional().nullable(),
    carrier_name: z.string().trim().optional().nullable(),
    expense_type: z.string().trim().optional().nullable(),
    amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
    payment_type: z.enum(['перечисление', 'наличка', 'карта']),
    comment: z.string().trim().optional().nullable(),
    ...currencyFields,
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD' && !data.usd_rate) {
      ctx.addIssue({ code: 'custom', path: ['usd_rate'], message: 'Укажите курс доллара' });
    }
    if (data.category === 'перевозчик' && !data.carrier_name) {
      ctx.addIssue({ code: 'custom', path: ['carrier_name'], message: 'Укажите перевозчика' });
    }
    if (data.category === 'прочее' && !data.comment) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Комментарий обязателен для прочих расходов' });
    }
    if (data.category !== 'перевозчик' && !data.expense_type) {
      ctx.addIssue({ code: 'custom', path: ['expense_type'], message: 'Укажите тип расхода' });
    }
  });
