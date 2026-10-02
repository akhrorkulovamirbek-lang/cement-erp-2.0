import { z } from 'zod';
import { PACKAGING_TYPES } from '../../core/constants.js';

const vehicleTypeEnum = z.enum(['CLIENT', 'OWN', 'HIRED']);

const baseIncomingSchema = z.object({
  date: z.string().min(1),
  warehouse: z.enum(['FACT', 'DIRECT', 'CLIENT_GOODS']).default('FACT'),
  zavod_id: z.coerce.number().int().positive('Выберите завод'),
  cement_mark_id: z.coerce.number().int().positive('Выберите марку цемента'),
  packaging: z.enum(PACKAGING_TYPES),
  tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),
  price_per_ton: z.coerce.number().positive('Цена должна быть больше нуля'),
  machine_number: z.string().trim().optional().nullable().default(null),
  comment: z.string().trim().optional().nullable().default(null),

  // Только для warehouse = 'DIRECT' (раздел 2 ТЗ, пункты 10-13):
  client_id: z.coerce.number().int().positive().optional().nullable(),
  sale_price_per_ton: z.coerce.number().positive().optional().nullable(),
  vehicle_type: vehicleTypeEnum.optional().nullable(),
  own_vehicle_id: z.coerce.number().int().positive().optional().nullable(),
  sale_machine_number: z.string().trim().optional().nullable(),
  carrier_name: z.string().trim().optional().nullable(),
  freight_price_per_ton: z.coerce.number().optional().nullable(),
  hire_price_per_ton: z.coerce.number().optional().nullable(),
});

export const incomingSchema = baseIncomingSchema.superRefine((data, ctx) => {
  if (data.warehouse === 'CLIENT_GOODS') {
    if (!data.client_id) ctx.addIssue({ code: 'custom', path: ['client_id'], message: 'Выберите клиента' });
    return;
  }
  if (data.warehouse !== 'DIRECT') return;

  if (!data.client_id) ctx.addIssue({ code: 'custom', path: ['client_id'], message: 'Выберите клиента' });
  if (!data.sale_price_per_ton) {
    ctx.addIssue({ code: 'custom', path: ['sale_price_per_ton'], message: 'Укажите цену продажи' });
  }
  if (!data.vehicle_type) {
    ctx.addIssue({ code: 'custom', path: ['vehicle_type'], message: 'Выберите тип машины' });
    return;
  }
  if (data.vehicle_type === 'OWN' && !data.own_vehicle_id) {
    ctx.addIssue({ code: 'custom', path: ['own_vehicle_id'], message: 'Выберите машину' });
  }
  if (data.vehicle_type !== 'CLIENT' && !data.freight_price_per_ton) {
    ctx.addIssue({ code: 'custom', path: ['freight_price_per_ton'], message: 'Укажите цену перевозки' });
  }
  if (data.vehicle_type === 'HIRED') {
    if (!data.sale_machine_number) {
      ctx.addIssue({ code: 'custom', path: ['sale_machine_number'], message: 'Укажите номер машины' });
    }
    if (!data.carrier_name) ctx.addIssue({ code: 'custom', path: ['carrier_name'], message: 'Укажите перевозчика' });
    if (!data.hire_price_per_ton) {
      ctx.addIssue({ code: 'custom', path: ['hire_price_per_ton'], message: 'Укажите цену найма' });
    }
  }
});
