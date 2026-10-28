import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { UZS_EXPENSE } from './routes.js';

/** «Контроль данных»: ищет в базе то, что молча искажает отчёты — операции, не попавшие в карточку нужного
 * контрагента, дубли, перепутанные названия и номера, расхождения остатков. Только чтение, ничего не меняет.
 * Каждая проверка: что нашли, почему это важно, что делать и до 30 примеров. */

export const dataHealthRouter = Router();

interface Item {
  title: string;
  detail: string;
}
interface Check {
  key: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  /** Почему это плохо, простыми словами. */
  why: string;
  /** Что сделать. */
  fix: string;
  count: number;
  items: Item[];
}

const LIMIT = 30;
const fmt = (v: unknown) => Math.round(Number(v)).toLocaleString('ru-RU');
const dmy = (d: string) => `${String(d).slice(8, 10)}.${String(d).slice(5, 7)}.${String(d).slice(0, 4)}`;
const tashkentToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

// Буквы, которые в номерах и названиях путают между кириллицей и латиницей.
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
const plateKey = (s: string) =>
  s
    .toUpperCase()
    .replace(/\s+/g, '')
    .split('')
    .map((ch) => LOOKALIKE[ch] ?? ch)
    .join('');
const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

dataHealthRouter.get(
  '/data-health',
  asyncHandler(async (_req, res) => {
    const today = tashkentToday();
    const checks: Check[] = [];
    const add = (c: Omit<Check, 'count' | 'items'> & { count?: number; items: Item[] }) => checks.push({ ...c, count: c.count ?? c.items.length, items: c.items.slice(0, LIMIT) });

    const [zavody, clients, factories, machines] = await Promise.all([
      pool.query('SELECT id, name FROM zavody'),
      pool.query('SELECT id, name, is_supplier FROM clients'),
      pool.query('SELECT id, name FROM factories'),
      pool.query('SELECT id, number FROM machines'),
    ]);

    // 1. Один и тот же человек заведён и поставщиком, и клиентом
    {
      const byKey = new Map<string, { z: string[]; c: string[] }>();
      for (const z of zavody.rows) byKey.set(nameKey(z.name), { z: [...(byKey.get(nameKey(z.name))?.z ?? []), z.name], c: byKey.get(nameKey(z.name))?.c ?? [] });
      for (const c of clients.rows) byKey.set(nameKey(c.name), { z: byKey.get(nameKey(c.name))?.z ?? [], c: [...(byKey.get(nameKey(c.name))?.c ?? []), c.name] });
      const both = [...byKey.values()].filter((g) => g.z.length > 0 && g.c.length > 0);
      add({
        key: 'supplier_and_client',
        title: 'Один контрагент заведён и как поставщик, и как клиент',
        severity: 'high',
        why: 'Операции с ним могут записываться в разные карточки: покупка — в карточку поставщика, оплата или продажа — в карточку клиента. Из-за этого сверка с ним не сходится.',
        fix: 'Решите, где вести этого контрагента. Если он и покупает у вас, и продаёт вам — оставьте клиента с отметкой «Он же поставщик» и внесите операции туда.',
        items: both.map((g) => ({ title: g.z[0], detail: `есть среди поставщиков (${g.z.length}) и среди клиентов (${g.c.length})` })),
      });
    }

    // 2. Дубли справочников (одно и то же имя в разном написании)
    {
      const dup = (rows: { name: string }[], what: string) => {
        const g = new Map<string, string[]>();
        for (const r of rows) g.set(nameKey(r.name), [...(g.get(nameKey(r.name)) ?? []), r.name]);
        return [...g.values()].filter((names) => names.length > 1).map((names) => ({ title: names.join('  /  '), detail: what }));
      };
      add({
        key: 'duplicate_names',
        title: 'Дубли в справочниках (одно имя записано по-разному)',
        severity: 'high',
        why: 'Операции делятся между двумя карточками одного и того же контрагента, поэтому долг и история в каждой неполные.',
        fix: 'Оставьте одну карточку, операции второй перенесите в неё (через «Изменить» в записях) и удалите лишнюю.',
        items: [...dup(zavody.rows, 'поставщики'), ...dup(clients.rows, 'клиенты'), ...dup(factories.rows, 'заводы')],
      });
    }

    // 3. Оплата поставщику без поставщика
    {
      const { rows } = await pool.query(
        `SELECT date, amount, currency, comment, COUNT(*) OVER() AS total FROM cash_expense WHERE category = 'цемент' AND zavod_id IS NULL ORDER BY date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'payment_no_supplier',
        title: 'Оплата за цемент без указанного поставщика',
        severity: 'high',
        why: 'Эти деньги ушли из кассы, но не уменьшили долг ни одного поставщика — в его карточке и в сверке их не видно.',
        fix: 'Откройте операцию в «Кассе» → «Изменить» и выберите поставщика.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${fmt(r.amount)} ${r.currency === 'USD' ? '$' : 'сум'}`, detail: r.comment || 'без комментария' })),
      });
    }

    // 4. Оплата клиента без клиента
    {
      const { rows } = await pool.query(
        `SELECT date, amount, currency, comment, payer_name, COUNT(*) OVER() AS total FROM cash_income
         WHERE client_id IS NULL AND category IN ('цемент', 'логистика') ORDER BY date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'income_no_client',
        title: 'Поступление за цемент или логистику без клиента',
        severity: 'high',
        why: 'Деньги в кассе есть, но долг клиента не уменьшился: клиент в отчётах выглядит должником, хотя заплатил.',
        fix: 'Откройте операцию в «Кассе» → «Изменить» и выберите клиента.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${fmt(r.amount)} ${r.currency === 'USD' ? '$' : 'сум'}`, detail: [r.payer_name && `платил: ${r.payer_name}`, r.comment].filter(Boolean).join(' · ') || 'без комментария' })),
      });
    }

    // 5. Оплата перевозчику без перевозчика
    {
      const { rows } = await pool.query(
        `SELECT date, amount, currency, comment, COUNT(*) OVER() AS total FROM cash_expense
         WHERE category = 'перевозчик' AND (carrier_name IS NULL OR btrim(carrier_name) = '') ORDER BY date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'carrier_payment_no_name',
        title: 'Оплата перевозчику без имени перевозчика',
        severity: 'medium',
        why: 'Выплата не попадает в баланс ни одного перевозчика.',
        fix: 'Откройте операцию в «Кассе» → «Изменить» и укажите перевозчика.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${fmt(r.amount)} сум`, detail: r.comment || 'без комментария' })),
      });
    }

    // 6. Приход «Напрямую» без продажи и продажа «Напрямую» без прихода
    {
      const [a, b] = await Promise.all([
        pool.query(
          `SELECT i.date, i.tonnage, i.total_sum, z.name AS who, COUNT(*) OVER() AS total FROM incoming i JOIN zavody z ON z.id = i.zavod_id
           WHERE i.warehouse = 'DIRECT' AND i.linked_sale_id IS NULL ORDER BY i.date DESC LIMIT ${LIMIT}`,
        ),
        pool.query(
          `SELECT s.date, s.tonnage, s.total_sum, c.name AS who, COUNT(*) OVER() AS total FROM sales s LEFT JOIN clients c ON c.id = s.client_id
           WHERE s.source = 'direct' AND NOT EXISTS (SELECT 1 FROM incoming i WHERE i.id = s.linked_purchase_id) ORDER BY s.date DESC LIMIT ${LIMIT}`,
        ),
      ]);
      add({
        key: 'direct_orphans',
        title: 'Прямая продажа без пары (нет прихода или нет продажи)',
        severity: 'high',
        why: 'Прямая продажа должна состоять из прихода и продажи. Если одной части нет, долг поставщика или клиента посчитан неверно.',
        fix: 'Удалите такую запись и внесите прямую продажу заново через Приход → «Напрямую».',
        count: Number(a.rows[0]?.total ?? 0) + Number(b.rows[0]?.total ?? 0),
        items: [
          ...a.rows.map((r) => ({ title: `Приход ${dmy(r.date)} · ${r.who}`, detail: `${r.tonnage} т, ${fmt(r.total_sum)} сум — нет продажи клиенту` })),
          ...b.rows.map((r) => ({ title: `Продажа ${dmy(r.date)} · ${r.who ?? 'без клиента'}`, detail: `${r.tonnage} т, ${fmt(r.total_sum)} сум — нет прихода` })),
        ],
      });
    }

    // 7. Продажи цемента без себестоимости
    {
      const { rows } = await pool.query(
        `SELECT s.date, s.tonnage, s.price_per_ton, c.name AS who, COUNT(*) OVER() AS total FROM sales s LEFT JOIN clients c ON c.id = s.client_id
         WHERE s.sale_type = 'CEMENT' AND s.is_historical = false AND s.price_per_ton IS NOT NULL AND s.cost_per_ton = 0 ORDER BY s.date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'sales_no_cost',
        title: 'Продажи цемента с нулевой себестоимостью',
        severity: 'medium',
        why: 'Прибыль по таким продажам показывается равной всей выручке (ста процентам), поэтому прибыль и маржа в отчётах завышены.',
        fix: 'Обычно причина в том, что на складе не было прихода на момент продажи. Проверьте приход на эту марку и пересохраните продажу.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${r.who ?? 'без клиента'}`, detail: `${r.tonnage} т по ${fmt(r.price_per_ton)} сум` })),
      });
    }

    // 8. Продажи в убыток
    {
      const { rows } = await pool.query(
        `SELECT s.date, s.tonnage, s.price_per_ton, s.cost_per_ton, s.margin_total, c.name AS who, COUNT(*) OVER() AS total FROM sales s LEFT JOIN clients c ON c.id = s.client_id
         WHERE s.sale_type = 'CEMENT' AND s.is_historical = false AND s.margin_total < 0 ORDER BY s.margin_total LIMIT ${LIMIT}`,
      );
      add({
        key: 'sales_loss',
        title: 'Продажи цемента в убыток',
        severity: 'medium',
        why: 'Цена продажи ниже себестоимости. Бывает намеренно, но чаще это опечатка в цене.',
        fix: 'Проверьте цену в продаже. Если всё верно — ничего делать не нужно.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${r.who ?? 'без клиента'}`, detail: `продали по ${fmt(r.price_per_ton)}, себестоимость ${fmt(r.cost_per_ton)} → убыток ${fmt(-Number(r.margin_total))} сум` })),
      });
    }

    // 9. Тикеты: остаток не сходится с продажами
    {
      const { rows } = await pool.query(
        `SELECT t.ticket_number, t.bought_tonnage, t.remaining_tonnage, COALESCE(s.sold, 0) AS sold
         FROM tickets t LEFT JOIN (SELECT ticket_id, SUM(tonnage) AS sold FROM sales WHERE source = 'ticket' GROUP BY ticket_id) s ON s.ticket_id = t.id
         WHERE t.status = 'active' AND abs(t.bought_tonnage - COALESCE(s.sold, 0) - t.remaining_tonnage) > 0.001`,
      );
      add({
        key: 'ticket_balance',
        title: 'Остаток тикета не сходится: куплено − продано ≠ осталось',
        severity: 'high',
        why: 'Остаток тикета и сумма, замороженная в нём, неверны; брокерский счёт может расходиться с реальностью.',
        fix: 'Проверьте продажи по этому тикету: возможно, продажу удалили или изменили тоннаж. Исправьте тоннаж в продаже.',
        items: rows.map((r) => ({ title: `Тикет ${r.ticket_number}`, detail: `куплено ${r.bought_tonnage} т, продано ${r.sold} т, по расчёту осталось ${Number(r.bought_tonnage) - Number(r.sold)} т, в системе ${r.remaining_tonnage} т` })),
      });
    }

    // 10. Склад: отрицательные остатки
    {
      const { rows } = await pool.query(
        `SELECT z.name AS who, cm.name AS mark, wb.packaging, wb.tonnage FROM warehouse_balance wb
         JOIN zavody z ON z.id = wb.zavod_id JOIN cement_marks cm ON cm.id = wb.cement_mark_id WHERE wb.tonnage < -0.0005`,
      );
      add({
        key: 'negative_stock',
        title: 'Отрицательный остаток на складе',
        severity: 'high',
        why: 'Продали больше, чем приходовали. Себестоимость продаж и стоимость склада считаются неверно.',
        fix: 'Найдите недостающий приход (возможно, не внесли поставку) и внесите его.',
        items: rows.map((r) => ({ title: `${r.who} · ${r.mark} · ${r.packaging === 'MESHOK' ? 'мешок' : 'навал'}`, detail: `${r.tonnage} т` })),
      });
    }

    // 11. Брокерский счёт: остаток против суммы операций
    {
      const { rows } = await pool.query(
        `SELECT (SELECT balance FROM broker_account WHERE id = 1) AS bal,
                (SELECT COALESCE(SUM(CASE WHEN type = 'ticket_purchase' THEN -amount ELSE amount END), 0) FROM broker_operations) AS ops`,
      );
      const diff = Number(rows[0].bal) - Number(rows[0].ops);
      add({
        key: 'broker_balance',
        title: 'Остаток брокерского счёта не равен сумме операций',
        severity: 'high',
        why: 'Остаток на счёте и история операций расходятся — выписка для сверки с брокером не сойдётся.',
        fix: 'Проверьте операции пополнения, покупки и возврата тикетов за последнее время.',
        items: Math.abs(diff) > 1 ? [{ title: 'Расхождение', detail: `по счёту ${fmt(rows[0].bal)} сум, по операциям ${fmt(rows[0].ops)} сум, разница ${fmt(diff)} сум` }] : [],
      });
    }

    // 12. Возможные дубли приходов и продаж
    {
      const [inc, sal] = await Promise.all([
        pool.query(
          `SELECT i.date, z.name AS who, i.tonnage, i.price_per_ton, COALESCE(i.machine_number, '') AS machine, COUNT(*) AS n
           FROM incoming i JOIN zavody z ON z.id = i.zavod_id WHERE i.is_historical = false
           GROUP BY i.date, z.name, i.tonnage, i.price_per_ton, i.machine_number, i.cement_mark_id, i.packaging, i.warehouse HAVING COUNT(*) > 1 ORDER BY i.date DESC LIMIT ${LIMIT}`,
        ),
        pool.query(
          `SELECT s.date, c.name AS who, s.tonnage, s.price_per_ton, COALESCE(s.machine_number, '') AS machine, COUNT(*) AS n
           FROM sales s LEFT JOIN clients c ON c.id = s.client_id WHERE s.is_historical = false
           GROUP BY s.date, c.name, s.tonnage, s.price_per_ton, s.machine_number, s.sale_type, s.cement_mark_id HAVING COUNT(*) > 1 ORDER BY s.date DESC LIMIT ${LIMIT}`,
        ),
      ]);
      add({
        key: 'duplicates',
        title: 'Возможные дубли: одинаковые записи несколько раз',
        severity: 'medium',
        why: 'Одну и ту же поставку или продажу могли внести дважды: долг и тоннаж завышены.',
        fix: 'Откройте записи и, если это действительно дубль, удалите лишнюю. Если две машины одинаковых размеров — всё в порядке.',
        items: [
          ...inc.rows.map((r) => ({ title: `Приход ${dmy(r.date)} · ${r.who}`, detail: `${r.n} одинаковых: ${r.tonnage} т по ${fmt(r.price_per_ton)}${r.machine ? `, машина ${r.machine}` : ''}` })),
          ...sal.rows.map((r) => ({ title: `Продажа ${dmy(r.date)} · ${r.who ?? 'без клиента'}`, detail: `${r.n} одинаковых: ${r.tonnage} т по ${fmt(r.price_per_ton)}${r.machine ? `, машина ${r.machine}` : ''}` })),
        ],
      });
    }

    // 13. Подозрительные даты
    {
      const { rows } = await pool.query(
        `SELECT src, date, who FROM (
           SELECT 'Приход' AS src, i.date, z.name AS who FROM incoming i JOIN zavody z ON z.id = i.zavod_id
           UNION ALL SELECT 'Продажа', s.date, c.name FROM sales s LEFT JOIN clients c ON c.id = s.client_id
           UNION ALL SELECT 'Оплата клиента', ci.date, c.name FROM cash_income ci LEFT JOIN clients c ON c.id = ci.client_id
           UNION ALL SELECT 'Расход кассы', ce.date, ce.category FROM cash_expense ce
         ) t WHERE date > $1::date + 1 OR date < $1::date - 540 ORDER BY date DESC LIMIT ${LIMIT}`,
        [today],
      );
      add({
        key: 'suspicious_dates',
        title: 'Операции с подозрительной датой (в будущем или очень давно)',
        severity: 'medium',
        why: 'Чаще всего это опечатка в годе или месяце: операция «выпадает» из нужного периода и не попадает в отчёты.',
        fix: 'Откройте запись → «Изменить» и поправьте дату.',
        items: rows.map((r) => ({ title: `${r.src} · ${dmy(r.date)}`, detail: String(r.who ?? '—') })),
      });
    }

    // 14. Заказы давно ждут отгрузки
    {
      const { rows } = await pool.query(
        `SELECT s.date, s.tonnage, c.name AS who, COUNT(*) OVER() AS total FROM sales s LEFT JOIN clients c ON c.id = s.client_id
         WHERE s.awaiting_shipment = true AND s.date < $1::date - 3 ORDER BY s.date LIMIT ${LIMIT}`,
        [today],
      );
      add({
        key: 'awaiting_old',
        title: 'Заказы давно «ждут отгрузки»',
        severity: 'low',
        why: 'Возможно, цемент уже отгружен, а статус не поменяли — клиенту не уйдёт вопрос о доставке, а отчёт по неотгруженным завышен.',
        fix: 'В «Продажах» нажмите «Отгрузить» у тех заказов, что уже уехали.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${r.who ?? 'без клиента'}`, detail: `${r.tonnage} т` })),
      });
    }

    // 15. Цены сильно отличаются от обычных
    {
      const { rows } = await pool.query(
        `SELECT 'Продажа' AS src, s.date, c.name AS who, s.cement_mark_id, s.packaging, s.price_per_ton AS price FROM sales s LEFT JOIN clients c ON c.id = s.client_id
           WHERE s.sale_type = 'CEMENT' AND s.price_per_ton > 0 AND s.is_historical = false
         UNION ALL
         SELECT 'Приход', i.date, z.name, i.cement_mark_id, i.packaging, i.price_per_ton FROM incoming i JOIN zavody z ON z.id = i.zavod_id
           WHERE i.warehouse IN ('FACT', 'DIRECT') AND i.price_per_ton > 0 AND i.is_historical = false`,
      );
      const groups = new Map<string, number[]>();
      for (const r of rows) groups.set(`${r.src}|${r.cement_mark_id}|${r.packaging}`, [...(groups.get(`${r.src}|${r.cement_mark_id}|${r.packaging}`) ?? []), Number(r.price)]);
      const med = new Map([...groups].filter(([, v]) => v.length >= 4).map(([k, v]) => [k, median(v)]));
      const odd = rows
        .filter((r) => {
          const m = med.get(`${r.src}|${r.cement_mark_id}|${r.packaging}`);
          return m ? Math.abs(Number(r.price) - m) / m > 0.3 : false;
        })
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      add({
        key: 'price_outliers',
        title: 'Цена сильно отличается от обычной (на 30% и больше)',
        severity: 'medium',
        why: 'Частая причина — лишний или пропущенный ноль, либо перепутаны цена за тонну и сумма.',
        fix: 'Откройте запись и проверьте цену за тонну.',
        items: odd.map((r) => ({ title: `${r.src} ${dmy(r.date)} · ${r.who ?? '—'}`, detail: `цена ${fmt(r.price)} за тонну, а обычно около ${fmt(med.get(`${r.src}|${r.cement_mark_id}|${r.packaging}`) ?? 0)}` })),
      });
    }

    // 16. Слишком большой тоннаж на одну машину
    {
      const { rows } = await pool.query(
        `SELECT src, date, who, tonnage, machine FROM (
           SELECT 'Приход' AS src, i.date, z.name AS who, i.tonnage, i.machine_number AS machine FROM incoming i JOIN zavody z ON z.id = i.zavod_id WHERE i.warehouse <> 'CLIENT_GOODS'
           UNION ALL SELECT 'Продажа', s.date, c.name, s.tonnage, s.machine_number FROM sales s LEFT JOIN clients c ON c.id = s.client_id WHERE s.sale_type = 'CEMENT'
         ) t WHERE machine IS NOT NULL AND btrim(machine) <> '' AND tonnage > 60 ORDER BY date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'huge_tonnage',
        title: 'Больше 60 тонн на одну машину',
        severity: 'low',
        why: 'Обычно цементовоз возит 25–50 тонн. Больше — вероятно, опечатка в тоннаже или в записи объединены несколько машин.',
        fix: 'Проверьте тоннаж в записи.',
        items: rows.map((r) => ({ title: `${r.src} ${dmy(r.date)} · ${r.who ?? '—'}`, detail: `${r.tonnage} т, машина ${r.machine}` })),
      });
    }

    // 17. Один номер машины записан по-разному
    {
      const { rows } = await pool.query(
        `SELECT plate FROM (
           SELECT machine_number AS plate FROM sales WHERE machine_number IS NOT NULL
           UNION ALL SELECT machine_number FROM incoming WHERE machine_number IS NOT NULL
           UNION ALL SELECT machine_number FROM cash_expense WHERE machine_number IS NOT NULL
         ) t WHERE btrim(plate) <> ''`,
      );
      const byKey = new Map<string, Set<string>>();
      for (const r of rows) byKey.set(plateKey(r.plate), (byKey.get(plateKey(r.plate)) ?? new Set()).add(String(r.plate).trim()));
      const variants = [...byKey.values()].filter((s) => s.size > 1);
      const mixed = [...new Set(rows.map((r) => String(r.plate).trim()))].filter((p) => /[А-Яа-я]/.test(p) && /[A-Za-z]/.test(p));
      add({
        key: 'plate_variants',
        title: 'Один номер машины записан по-разному',
        severity: 'medium',
        why: 'Система считает такие записи разными машинами: история рейсов и отчёты по машине делятся на части. Часто путаются латинские и русские буквы (A и А, H и Н, B и В).',
        fix: 'Приведите номер к одному написанию в записях (латиницей, без пробелов).',
        items: [
          ...variants.map((s) => ({ title: [...s].join('  /  '), detail: 'вероятно, одна и та же машина' })),
          ...mixed.map((p) => ({ title: p, detail: 'в одном номере смешаны русские и латинские буквы' })),
        ],
      });
    }

    // 18. Незавершённые «отложки»
    {
      const { rows } = await pool.query(
        `SELECT s.date, s.tonnage, c.name AS who, s.price_per_ton, COUNT(*) OVER() AS total FROM sales s LEFT JOIN clients c ON c.id = s.client_id
         WHERE s.is_deferred = true AND (s.client_id IS NULL OR s.price_per_ton IS NULL) ORDER BY s.date LIMIT ${LIMIT}`,
      );
      add({
        key: 'deferred_open',
        title: 'Отложенные продажи без клиента или цены',
        severity: 'low',
        why: 'Цемент ушёл, но выручка и долг клиента ещё не записаны.',
        fix: 'Откройте продажу → «Изменить», укажите клиента и цену.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · ${r.who ?? 'клиент не указан'}`, detail: `${r.tonnage} т, цена ${r.price_per_ton ? fmt(r.price_per_ton) : 'не указана'}` })),
      });
    }

    // 19. Расходы кассы в валюте без курса, суммы USD
    {
      const { rows } = await pool.query(
        `SELECT date, amount, COUNT(*) OVER() AS total FROM (
           SELECT date, amount, currency, usd_rate FROM cash_income UNION ALL SELECT date, amount, currency, usd_rate FROM cash_expense
         ) t WHERE currency = 'USD' AND (usd_rate IS NULL OR usd_rate <= 0) ORDER BY date DESC LIMIT ${LIMIT}`,
      );
      add({
        key: 'usd_no_rate',
        title: 'Операции в долларах без курса',
        severity: 'high',
        why: 'Без курса доллары считаются как ноль сум: долги и остатки неверны.',
        fix: 'Откройте операцию в «Кассе» → «Изменить» и укажите курс.',
        count: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({ title: `${dmy(r.date)} · $${fmt(r.amount)}`, detail: 'курс не указан' })),
      });
    }

    // 20. Клиент много переплатил (скорее всего, оплата записана не на того клиента)
    {
      const { rows } = await pool.query(
        `SELECT c.name, c.initial_debt + COALESCE(st.total, 0) - COALESCE(pt.total, 0) AS balance
         FROM clients c
         LEFT JOIN (SELECT client_id, SUM(total_sum) AS total FROM sales GROUP BY client_id) st ON st.client_id = c.id
         LEFT JOIN (SELECT client_id, SUM(CASE WHEN currency = 'USD' THEN amount * COALESCE(usd_rate, 0) ELSE amount END) AS total FROM cash_income WHERE client_id IS NOT NULL GROUP BY client_id) pt ON pt.client_id = c.id
         WHERE c.initial_debt + COALESCE(st.total, 0) - COALESCE(pt.total, 0) < -1000000 ORDER BY 2 LIMIT ${LIMIT}`,
      );
      add({
        key: 'client_overpaid',
        title: 'Клиент заплатил больше, чем купил',
        severity: 'low',
        why: 'Возможно, оплата записана не на того клиента (особенно если у вас клиенты с похожими именами) или не внесена одна из продаж.',
        fix: 'Проверьте оплаты этого клиента и его продажи. Если он заплатил вперёд — всё в порядке.',
        items: rows.map((r) => ({ title: r.name, detail: `переплата ${fmt(-Number(r.balance))} сум` })),
      });
    }

    // Лишний вызов, чтобы UZS_EXPENSE не считался неиспользуемым и оставался доступен для будущих проверок.
    void UZS_EXPENSE;

    const order = { high: 0, medium: 1, low: 2 } as const;
    checks.sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || order[a.severity] - order[b.severity]);
    res.json({ checks, generatedAt: new Date().toISOString() });
  }),
);
