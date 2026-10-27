import { pool } from '../../db/pool.js';
import { publicPool, runInTenant } from '../../db/tenant.js';
import { fmt } from './clientBot.js';
import { getOrgBot, keyboard, tg } from './telegram.js';

/** Вечерний опрос клиентов: по каждому отгруженному заказу бот спрашивает «доставлен?» (да/нет).
 * Запускается раз в день в выбранный час (по Ташкенту); можно запустить вручную из настроек. */

const PACKAGING: Record<string, string> = { MESHOK: 'мешок', NAVAL: 'навал' };
const TZ = 'Asia/Tashkent';
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtT = (v: unknown) => Number(Number(v).toFixed(3)).toLocaleString('ru-RU');
// Спрашиваем только про свежие заказы: за последние дни, а не про всю историю.
const LOOKBACK_DAYS = 3;

export const todayTashkent = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const hourTashkent = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));

export interface SurveySettings {
  enabled: boolean;
  hour: number;
  lastRun: string | null;
}

export async function getSurveySettings(): Promise<SurveySettings> {
  const { rows } = await pool.query(`SELECT key, value FROM bot_settings WHERE key IN ('survey_enabled', 'survey_hour', 'survey_last_run')`);
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  return { enabled: m.survey_enabled !== 'false', hour: m.survey_hour ? Number(m.survey_hour) : 18, lastRun: m.survey_last_run ?? null };
}

export async function setSurveySetting(key: 'survey_enabled' | 'survey_hour' | 'survey_last_run', value: string) {
  await pool.query(`INSERT INTO bot_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
}

export function orderText(s: { date: string; sale_type: string; mark: string | null; packaging: string | null; tonnage: string; total_sum: string; machine: string | null }): string {
  const what = s.sale_type === 'CEMENT' ? `Цемент ${s.mark ?? ''}${s.packaging ? ` (${PACKAGING[s.packaging] ?? s.packaging})` : ''}` : 'Перевозка';
  return `${what}\n${dmy(s.date)} · ${fmtT(s.tonnage)} т · ${fmt(s.total_sum)} сум${s.machine ? `\nМашина: ${s.machine}` : ''}`;
}

/** Отправляет клиентам вопросы о доставке. Возвращает, сколько заказов опрошено. */
export async function runDeliverySurvey(orgId: number): Promise<number> {
  const bot = await getOrgBot(orgId);
  if (!bot) return 0;
  const today = todayTashkent();
  const { rows } = await pool.query(
    `SELECT s.id, s.client_id, s.date, s.sale_type, cm.name AS mark, s.packaging, s.tonnage, s.total_sum,
            COALESCE(ov.number, s.machine_number) AS machine
     FROM sales s
     LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id
     LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
     WHERE s.client_id IS NOT NULL AND s.delivery_status IS NULL AND s.awaiting_shipment = false AND s.is_historical = false
       AND s.total_sum > 0 AND s.date <= $1::date AND s.date >= ($1::date - $2::int)
       AND EXISTS (SELECT 1 FROM bot_client_links l WHERE l.client_id = s.client_id AND l.telegram_id IS NOT NULL)
     ORDER BY s.client_id, s.date, s.id`,
    [today, LOOKBACK_DAYS],
  );
  let asked = 0;
  const byClient = new Map<number, typeof rows>();
  for (const r of rows) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), r]);

  for (const [clientId, orders] of byClient) {
    const { rows: people } = await pool.query('SELECT telegram_id FROM bot_client_links WHERE client_id = $1 AND telegram_id IS NOT NULL', [clientId]);
    for (const p of people) {
      await tg(bot.token, 'sendMessage', {
        chat_id: p.telegram_id,
        text: `📦 Подтвердите, пожалуйста, доставку ${orders.length === 1 ? 'заказа' : `заказов (${orders.length})`}. Ответьте на каждый вопрос ниже.`,
      }).catch(() => undefined);
    }
    for (const o of orders) {
      let delivered = false;
      for (const p of people) {
        try {
          await tg(bot.token, 'sendMessage', {
            chat_id: p.telegram_id,
            text: `Ваш заказ был доставлен?\n\n${orderText(o)}`,
            reply_markup: keyboard([[{ text: '✅ Да, доставлен', data: `d:${o.id}:y` }, { text: '❌ Нет', data: `d:${o.id}:n` }]]),
          });
          delivered = true;
        } catch (err) {
          console.error('survey send:', err instanceof Error ? err.message : err);
        }
      }
      if (delivered) {
        await pool.query(`UPDATE sales SET delivery_status = 'asked', delivery_asked_at = now() WHERE id = $1`, [o.id]);
        asked++;
      }
    }
  }
  return asked;
}

/** Раз в 5 минут проверяет, не пора ли отправить вечерний опрос в каждой организации с подключённым ботом. */
export function startSurveyScheduler(): void {
  const tick = async () => {
    try {
      const { rows: orgs } = await publicPool.query(`SELECT id FROM organizations WHERE active AND bot_token IS NOT NULL`);
      for (const org of orgs) {
        await runInTenant(org.id, async () => {
          const st = await getSurveySettings();
          const today = todayTashkent();
          if (!st.enabled || st.lastRun === today || hourTashkent() < st.hour) return;
          // Сначала отмечаем день, чтобы при сбое не слать опрос повторно каждые 5 минут.
          await setSurveySetting('survey_last_run', today);
          const n = await runDeliverySurvey(org.id);
          if (n > 0) console.log(`Delivery survey: org ${org.id}, asked ${n}`);
        });
      }
    } catch (err) {
      console.error('survey scheduler:', err instanceof Error ? err.message : err);
    }
  };
  setInterval(tick, 5 * 60 * 1000).unref();
}
