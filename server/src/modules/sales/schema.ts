import { z } from 'zod';
import { PACKAGING_TYPES } from '../../core/constants.js';

const vehicleTypeEnum = z.enum(['CLIENT', 'OWN', 'HIRED']);

const baseSaleSchema = z.object({
  date: z.string().min(1),
  sale_type: z.enum(['CEMENT', 'LOGISTICS']).default('CEMENT'),
  client_id: z.coerce.number().int().positive('Выберите клиента'),
  comment: z.string().trim().optional().nullable().default(null),

  // Цемент (раздел 3.1 ТЗ):
  source: z.enum(['warehouse', 'ticket']).optional().nullable(),
  zavod_id: z.coerce.number().int().positive().optional().nullable(),
  cement_mark_id: z.coerce.number().int().positive().optional().nullable(),
  packaging: z.enum(PACKAGING_TYPES).optional().nullable(),
  ticket_id: z.coerce.number().int().positive().optional().nullable(),
  price_per_ton: z.coerce.number().positive().optional().nullable(),

  tonnage: z.coerce.number().positive('Тоннаж должен быть больше нуля'),

  // Тип машины — общий для обеих веток (раздел 3, пункт 9; для Логистики сервер переопределяет
  // OWN/HIRED сам по номеру машины, CLIENT в ней невозможен).
  vehicle_type: vehicleTypeEnum,
  own_vehicle_id: z.coerce.number().int().positive().optional().nullable(),
  machine_number: z.string().trim().optional().nullable(),
  carrier_name: z.string().trim().optional().nullable(),
  freight_price_per_ton: z.coerce.number().optional().nullable(),
  hire_price_per_ton: z.coerce.number().optional().nullable(),

  // Логистика (раздел 3.2 ТЗ):
  route: z.string().trim().optional().nullable(),
});

export const saleSchema = baseSaleSchema.superRefine((data, ctx) => {
  if (data.sale_type === 'CEMENT') {
    if (!data.source) {
      ctx.addIssue({ code: 'custom', path: ['source'], message: 'Выберите источник' });
    } else if (data.source === 'ticket') {
      if (!data.ticket_id) ctx.addIssue({ code: 'custom', path: ['ticket_id'], message: 'Выберите тикет' });
    } else {
      if (!data.zavod_id) ctx.addIssue({ code: 'custom', path: ['zavod_id'], message: 'Выберите завод' });
      if (!data.cement_mark_id) ctx.addIssue({ code: 'custom', path: ['cement_mark_id'], message: 'Выберите марку цемента' });
      if (!data.packaging) ctx.addIssue({ code: 'custom', path: ['packaging'], message: 'Выберите упаковку' });
    }
    if (!data.price_per_ton) ctx.addIssue({ code: 'custom', path: ['price_per_ton'], message: 'Укажите цену' });

    if (data.vehicle_type === 'CLIENT' && !data.machine_number) {
      ctx.addIssue({ code: 'custom', path: ['machine_number'], message: 'Укажите номер машины' });
    }
    if (data.vehicle_type === 'OWN') {
      if (!data.own_vehicle_id) ctx.addIssue({ code: 'custom', path: ['own_vehicle_id'], message: 'Выберите машину' });
      if (!data.freight_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['freight_price_per_ton'], message: 'Укажите цену перевозки' });
      }
    }
    if (data.vehicle_type === 'HIRED') {
      if (!data.machine_number) ctx.addIssue({ code: 'custom', path: ['machine_number'], message: 'Укажите номер машины' });
      if (!data.carrier_name) ctx.addIssue({ code: 'custom', path: ['carrier_name'], message: 'Укажите перевозчика' });
      if (!data.freight_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['freight_price_per_ton'], message: 'Укажите цену перевозки для клиента' });
      }
      if (!data.hire_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['hire_price_per_ton'], message: 'Укажите цену найма' });
      }
    }
  } else {
    if (!data.machine_number) ctx.addIssue({ code: 'custom', path: ['machine_number'], message: 'Укажите номер машины' });
    if (!data.freight_price_per_ton) {
      ctx.addIssue({ code: 'custom', path: ['freight_price_per_ton'], message: 'Укажите цену перевозки' });
    }
    // vehicle_type здесь — только подсказка фронта (сервер определяет сам по номеру машины,
    // см. resolveLogisticsVehicle в service.ts), но требования к полям для HIRED те же.
    if (data.vehicle_type === 'HIRED') {
      if (!data.carrier_name) ctx.addIssue({ code: 'custom', path: ['carrier_name'], message: 'Укажите перевозчика' });
      if (!data.hire_price_per_ton) {
        ctx.addIssue({ code: 'custom', path: ['hire_price_per_ton'], message: 'Укажите цену найма' });
      }
    }
  }
});
