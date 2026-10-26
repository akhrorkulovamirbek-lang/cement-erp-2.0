import { incomingSchema } from '../incoming/schema.js';
import { saleSchema } from '../sales/schema.js';

/** Общая для бота и мобильной формы часть: как из ответов менеджера собрать заявку и показать её текстом. */
export type Data = Record<string, string | number | null | undefined>;

export const PACKAGING_LABELS: Record<string, string> = { MESHOK: 'Мешок', NAVAL: 'Навал' };
export const VEHICLE_LABELS: Record<string, string> = { CLIENT: 'Машина клиента', OWN: 'Своя машина', HIRED: 'Наёмная машина' };

export const todayTashkent = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export function summaryOf(d: Data, names: Record<string, string>): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') lines.push(`${label}: ${value}`);
  };
  const fmt = (v: unknown) => Number(v).toLocaleString('ru-RU');
  add('Тип', d.sale_type === 'CEMENT' ? 'Цемент со склада' : d.sale_type === 'DIRECT' ? 'Напрямую от поставщика' : 'Логистика');
  add('Клиент', names.client_id);
  if (d.sale_type !== 'LOGISTICS') {
    add('Поставщик', names.zavod_id);
    add('Завод', names.factory_id);
    add('Марка', names.cement_mark_id);
    add('Упаковка', PACKAGING_LABELS[String(d.packaging)]);
  }
  add('Тоннаж', d.tonnage != null ? `${fmt(d.tonnage)} т` : null);
  if (d.sale_type === 'CEMENT') add('Цена за тонну', d.price_per_ton != null ? `${fmt(d.price_per_ton)} сум` : null);
  if (d.sale_type === 'DIRECT') {
    add('Цена закупки', d.price_per_ton != null ? `${fmt(d.price_per_ton)} сум` : null);
    add('Цена продажи', d.sale_price_per_ton != null ? `${fmt(d.sale_price_per_ton)} сум` : null);
  }
  add('Машина', VEHICLE_LABELS[String(d.vehicle_type)]);
  add('Номер', d.vehicle_type === 'OWN' ? names.own_vehicle_id : d.machine_number);
  add('Перевозчик', d.carrier_name);
  add('Перевозка за тонну', d.freight_price_per_ton != null ? `${fmt(d.freight_price_per_ton)} сум` : null);
  add('Найм за тонну', d.hire_price_per_ton != null ? `${fmt(d.hire_price_per_ton)} сум` : null);
  add('Комментарий', d.comment);
  return lines.join('\n');
}

/** Собирает заявку в формате обычной продажи (цемент, логистика) или прихода «Напрямую». Возвращает
 * готовые данные либо текст ошибки, если чего-то не хватает. */
export function buildPayload(d: Data, ownNumber: string | null): { payload: Record<string, unknown> } | { error: string } {
  const payload: Record<string, unknown> = {
    date: todayTashkent(),
    sale_type: d.sale_type,
    client_id: d.client_id,
    tonnage: d.tonnage,
    vehicle_type: d.vehicle_type,
    comment: d.comment || null,
    own_vehicle_id: d.vehicle_type === 'OWN' ? d.own_vehicle_id : null,
    machine_number: d.vehicle_type === 'OWN' ? ownNumber : (d.machine_number ?? null),
    carrier_name: d.vehicle_type === 'HIRED' ? d.carrier_name : null,
    freight_price_per_ton: d.freight_price_per_ton ?? null,
    hire_price_per_ton: d.vehicle_type === 'HIRED' ? d.hire_price_per_ton : null,
    awaiting_shipment: true,
  };
  if (d.sale_type === 'CEMENT') {
    Object.assign(payload, {
      source: 'warehouse',
      zavod_id: d.zavod_id,
      factory_id: d.factory_id,
      cement_mark_id: d.cement_mark_id,
      packaging: d.packaging,
      price_per_ton: d.price_per_ton,
    });
  }
  let check: { success: true } | { success: false; error: { issues: { message: string }[] } };
  if (d.sale_type === 'DIRECT') {
    // Прямая продажа оформляется приходом «Напрямую»: к нему система сама привязывает продажу клиенту.
    Object.assign(payload, {
      warehouse: 'DIRECT',
      zavod_id: d.zavod_id,
      factory_id: d.factory_id,
      cement_mark_id: d.cement_mark_id,
      packaging: d.packaging,
      price_per_ton: d.price_per_ton,
      sale_price_per_ton: d.sale_price_per_ton,
      sale_machine_number: d.vehicle_type === 'OWN' ? null : (d.machine_number ?? null),
      machine_number: null,
    });
    delete payload.sale_type;
    delete payload.awaiting_shipment;
    check = incomingSchema.safeParse(payload);
  } else {
    check = saleSchema.safeParse(payload);
  }
  if (!check.success) return { error: check.error.issues[0]?.message ?? 'проверьте данные' };
  return { payload };
}
