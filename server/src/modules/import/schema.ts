import { z } from 'zod';
import { PACKAGING_TYPES } from '../../core/constants.js';

const row = <T extends z.ZodRawShape>(shape: T) => z.array(z.object(shape)).min(1, 'Файл пуст');

export const importIncomingSchema = z.object({
  rows: row({
    date: z.string().min(1),
    zavod: z.string().trim().min(1, 'Укажите завод'),
    cement_mark: z.string().trim().min(1, 'Укажите марку'),
    packaging: z.enum(PACKAGING_TYPES),
    tonnage: z.coerce.number().positive(),
    price_per_ton: z.coerce.number().positive(),
    machine_number: z.string().trim().optional().nullable(),
    comment: z.string().trim().optional().nullable(),
  }),
});

// Цена перевозки/найма не проверялась здесь никак (только optional) — строка HIRED/OWN без
// freight_price_per_ton тихо получала total_sum=0 (computeFreightTotal считает его нулевой
// ценой), то же для CEMENT без price_per_ton (service.ts подставлял 0) — долг клиента занижался
// без единой ошибки. superRefine ниже повторяет те же обязательные поля, что и обычная форма
// Продажи (sales/schema.ts), кроме own_vehicle_id/привязки к справочнику machines — импорт не
// создаёт записи в machines, чтобы не засорять реальный парк техники историческими номерами.
const saleRowSchema = z
  .object({
    date: z.string().min(1),
    sale_type: z.enum(['CEMENT', 'LOGISTICS']),
    client: z.string().trim().min(1, 'Укажите клиента'),
    zavod: z.string().trim().optional().nullable(),
    cement_mark: z.string().trim().optional().nullable(),
    packaging: z.enum(PACKAGING_TYPES).optional().nullable(),
    tonnage: z.coerce.number().positive(),
    price_per_ton: z.coerce.number().optional().nullable(),
    vehicle_type: z.enum(['CLIENT', 'OWN', 'HIRED']).default('CLIENT'),
    machine_number: z.string().trim().optional().nullable(),
    carrier_name: z.string().trim().optional().nullable(),
    freight_price_per_ton: z.coerce.number().optional().nullable(),
    hire_price_per_ton: z.coerce.number().optional().nullable(),
    comment: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.sale_type === 'CEMENT' && !data.price_per_ton) {
      ctx.addIssue({ code: 'custom', path: ['price_per_ton'], message: 'Укажите цену за тонну' });
    }
    if (data.vehicle_type !== 'CLIENT' && !data.freight_price_per_ton) {
      ctx.addIssue({ code: 'custom', path: ['freight_price_per_ton'], message: 'Укажите цену перевозки' });
    }
    if (data.vehicle_type === 'HIRED') {
      if (!data.hire_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['hire_price_per_ton'], message: 'Укажите цену найма' });
      }
      if (!data.carrier_name) {
        ctx.addIssue({ code: 'custom', path: ['carrier_name'], message: 'Укажите перевозчика' });
      }
    }
  });

export const importSaleSchema = z.object({
  rows: z.array(saleRowSchema).min(1, 'Файл пуст'),
});

const CASH_INCOME_CATEGORIES = ['цемент', 'логистика', 'возврат_биржи', 'прочее'] as const;
const CASH_EXPENSE_CATEGORIES = ['цемент', 'логистика', 'перевозчик', 'прочее'] as const;

const cashRowSchema = z
  .object({
    date: z.string().min(1),
    type: z.enum(['income', 'expense']),
    category: z.string().trim().min(1, 'Укажите категорию'),
    client: z.string().trim().optional().nullable(),
    zavod: z.string().trim().optional().nullable(),
    carrier_name: z.string().trim().optional().nullable(),
    amount: z.coerce.number().positive(),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    usd_rate: z.coerce.number().positive().optional().nullable(),
    payment_type: z.enum(['перечисление', 'наличка', 'карта']),
    comment: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const allowed = data.type === 'income' ? CASH_INCOME_CATEGORIES : CASH_EXPENSE_CATEGORIES;
    if (!(allowed as readonly string[]).includes(data.category)) {
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: `Для типа «${data.type === 'income' ? 'Приход' : 'Расход'}» категория должна быть одной из: ${allowed.join(', ')}`,
      });
    }
  });

export const importCashSchema = z.object({
  rows: z.array(cashRowSchema).min(1, 'Файл пуст'),
});

export const importWarehouseSnapshotSchema = z.object({
  rows: row({
    zavod: z.string().trim().min(1, 'Укажите завод'),
    cement_mark: z.string().trim().min(1, 'Укажите марку'),
    packaging: z.enum(PACKAGING_TYPES),
    tonnage: z.coerce.number().min(0),
    avg_cost_per_ton: z.coerce.number().min(0),
  }),
});
