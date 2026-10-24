import { pool } from '../../db/pool.js';

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

const normalizePlate = (v: string) => v.replace(/\s+/g, '').toUpperCase();

/** Любой перевозчик, который встречается в рейсе или выплате, автоматически становится логистом
 * (если его там ещё нет), а номер его машины записывается за ним. Так «нынешние перевозчики» и новые
 * попадают в справочник «Логисты» без ручного ввода. Сравнение имён — без учёта регистра и краевых пробелов. */
export async function ensureLogist(db: Queryable, name: string | null | undefined, plate?: string | null): Promise<void> {
  const trimmed = name?.trim();
  if (!trimmed) return;

  const found = await db.query('SELECT id FROM logists WHERE norm_name(name) = norm_name($1)', [trimmed]);
  let id = found.rows[0]?.id as number | undefined;
  if (!id) {
    const created = await db.query('INSERT INTO logists (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [trimmed]);
    id = created.rows[0]?.id as number | undefined;
    if (!id) return;
  }
  if (plate?.trim()) {
    await db.query('INSERT INTO logist_machines (logist_id, number) VALUES ($1, $2) ON CONFLICT (number) DO NOTHING', [id, normalizePlate(plate)]);
  }
}

/** Разовый перенос: всех перевозчиков из старых рейсов и выплат — в справочник логистов, а номера
 * их наёмных машин — к ним (если номер встречался у нескольких перевозчиков, берётся последний рейс).
 * Выполняется один раз на организацию (отметка в app_settings), чтобы не возвращать то, что убрали вручную. */
export async function backfillLogists(): Promise<void> {
  const { rows } = await pool.query(`SELECT 1 FROM app_settings WHERE key = 'logists_backfilled'`);
  if (rows.length > 0) return;

  await pool.query(`
    INSERT INTO logists (name)
    SELECT DISTINCT ON (norm_name(n)) btrim(n)
    FROM (
      SELECT carrier_name AS n FROM sales WHERE carrier_name IS NOT NULL AND btrim(carrier_name) <> ''
      UNION ALL
      SELECT carrier_name FROM cash_expense WHERE category = 'перевозчик' AND carrier_name IS NOT NULL AND btrim(carrier_name) <> ''
    ) t
    WHERE NOT EXISTS (SELECT 1 FROM logists l WHERE norm_name(l.name) = norm_name(t.n))
    ORDER BY norm_name(n), n
    ON CONFLICT (name) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO logist_machines (logist_id, number)
    SELECT DISTINCT ON (s.pn) l.id, s.pn
    FROM (
      SELECT replace(upper(machine_number), ' ', '') AS pn, carrier_name, date, id
      FROM sales
      WHERE vehicle_type = 'HIRED' AND machine_number IS NOT NULL AND btrim(machine_number) <> ''
        AND carrier_name IS NOT NULL AND btrim(carrier_name) <> ''
    ) s
    JOIN logists l ON norm_name(l.name) = norm_name(s.carrier_name)
    ORDER BY s.pn, s.date DESC, s.id DESC
    ON CONFLICT (number) DO NOTHING
  `);
  await pool.query(`INSERT INTO app_settings (key, value) VALUES ('logists_backfilled', '1') ON CONFLICT (key) DO NOTHING`);
}
