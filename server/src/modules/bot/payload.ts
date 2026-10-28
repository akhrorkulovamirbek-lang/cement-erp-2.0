import { incomingSchema } from '../incoming/schema.js';
import { saleSchema } from '../sales/schema.js';

/** Общая для бота и мобильной формы часть: как из ответов менеджера собрать заявку и показать её текстом. */
export type Data = Record<string, string | number | null | undefined>;

export const PACKAGING_LABELS: Record<string, string> = { MESHOK: 'Мешок', NAVAL: 'Навал' };
export const VEHICLE_LABELS: Record<string, string> = { CLIENT: 'Машина клиента', OWN: 'Своя машина', HIRED: 'Наёмная машина' };

const FIELD_LABELS: Record<string, string> = {
  client_id: 'Клиент',
  zavod_id: 'Поставщик',
  factory_id: 'Завод',
  cement_mark_id: 'Марка',
  packaging: 'Упаковка',
  tonnage: 'Тоннаж',
  price_per_ton: 'Цена',
  sale_price_per_ton: 'Цена продажи',
  vehicle_type: 'Тип машины',
  machine_number: 'Номер машины',
  sale_machine_number: 'Номер машины',
  own_vehicle_id: 'Своя машина',
  carrier_name: 'Перевозчик',
  freight_price_per_ton: 'Цена перевозки',
  hire_price_per_ton: 'Цена найма',
  hire: 'Цена найма',
  ticket_id: 'Тикет',
};

export const todayTashkent = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export function summaryOf(d: Data, names: Record<string, string>): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') lines.push(`${label}: ${value}`);
  };
  const fmt = (v: unknown) => Number(v).toLocaleString('ru-RU');
  add('Тип', d.sale_type === 'CEMENT' ? 'Цемент со склада' : d.sale_type === 'TICKET' ? 'Цемент из тикета' : d.sale_type === 'DIRECT' ? 'Напрямую от поставщика' : 'Логистика');
  add('Клиент', names.client_id);
  if (d.sale_type === 'TICKET') add('Тикет', names.ticket_id);
  if (d.sale_type !== 'LOGISTICS') {
    add('Поставщик', names.zavod_id);
    add('Завод', names.factory_id);
    add('Марка', names.cement_mark_id);
    add('Упаковка', PACKAGING_LABELS[String(d.packaging)]);
  }
  add('Тоннаж', d.tonnage != null ? `${fmt(d.tonnage)} т` : null);
  if (d.sale_type === 'CEMENT' || d.sale_type === 'TICKET') add('Цена за тонну', d.price_per_ton != null ? `${fmt(d.price_per_ton)} сум` : null);
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
/** Базовая схема отбрасывает заявку, если нет типа машины или тоннажа, и не доходит до остальных проверок.
 * Чтобы оператор увидел весь список недостающего сразу, на время проверки подставляем заглушки. */
function probe(payload: Record<string, unknown>): { p: Record<string, unknown>; missing: string[] } {
  const p = { ...payload };
  const missing: string[] = [];
  if (!p.vehicle_type) {
    p.vehicle_type = 'CLIENT';
    missing.push('не указано: Тип машины');
  }
  if (!p.tonnage) {
    p.tonnage = 1;
    missing.push('не указано: Тоннаж');
  }
  return { p, missing };
}

export function buildPayload(d: Data, ownNumber: string | null, date?: string): { payload: Record<string, unknown> } | { error: string; errors: string[] } {
  const payload: Record<string, unknown> = {
    date: date ?? todayTashkent(),
    sale_type: d.sale_type === 'TICKET' ? 'CEMENT' : d.sale_type,
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
  if (d.sale_type === 'TICKET') {
    // Продажа из тикета: завод, марка и упаковка берутся из самого тикета, поэтому здесь их нет.
    Object.assign(payload, { source: 'ticket', ticket_id: d.ticket_id, factory_id: d.factory_id ?? null, price_per_ton: d.price_per_ton });
  }
  let check: { success: true } | { success: false; error: { issues: { message: string; path?: (string | number)[] }[] } };
  const failed = (c: { success: false; error: { issues: { message: string; path?: (string | number)[] }[] } }) => {
    // Технические «Required» заменяем названием поля, чтобы оператор видел, чего именно не хватает.
    const errors = [
      ...new Set(
        c.error.issues.map((i) => {
          const field = FIELD_LABELS[String(i.path?.[0] ?? '')];
          return /^(Required|Invalid|Expected)/i.test(i.message) ? (field ? `не указано: ${field}` : 'проверьте данные') : i.message;
        }),
      ),
    ];
    return { error: errors[0] ?? 'проверьте данные', errors };
  };
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
    check = incomingSchema.safeParse(probe(payload).p);
  } else {
    check = saleSchema.safeParse(probe(payload).p);
  }
  const missing = probe(payload).missing;
  if (!check.success || missing.length > 0) {
    const f = check.success ? { error: '', errors: [] as string[] } : failed(check);
    const errors = [...missing, ...f.errors.filter((e) => !missing.includes(e))];
    return { error: errors[0] ?? 'проверьте данные', errors };
  }
  return { payload };
}

/** Для старых заявок, у которых сохранена только готовая продажа: восстанавливает «ответы менеджера» для редактирования. */
export function payloadToForm(p: Record<string, unknown>): Data {
  const isDirect = p.warehouse === 'DIRECT';
  const type = isDirect ? 'DIRECT' : p.source === 'ticket' ? 'TICKET' : String(p.sale_type ?? 'CEMENT');
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter((k) => p[k] !== undefined && p[k] !== null).map((k) => [k, p[k] as string | number]));
  return {
    sale_type: type,
    ...pick('client_id', 'zavod_id', 'factory_id', 'cement_mark_id', 'packaging', 'tonnage', 'price_per_ton', 'sale_price_per_ton', 'vehicle_type', 'own_vehicle_id', 'carrier_name', 'freight_price_per_ton', 'hire_price_per_ton', 'ticket_id', 'comment'),
    machine_number: ((isDirect ? p.sale_machine_number : p.machine_number) as string | null) ?? null,
  };
}
