import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { loadSettingsCache, seedSettingsDefaults } from '../core/settingsCache.js';
import { backfillLogists } from '../modules/logists/service.js';
import { pool } from './pool.js';
import { publicPool, runInTenant, schemaNameFor } from './tenant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSql = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf-8');

// Таблицы данных организации (всё, кроме organizations и users). Нужен только для разового
// переноса данных прежней одно-организационной версии из схемы public в схему первой организации.
const TENANT_TABLES = [
  'zavody',
  'clients',
  'cement_marks',
  'machines',
  'logistics_expense_categories',
  'bank_accounts',
  'permissions',
  'module_settings',
  'app_settings',
  'audit_log',
  'stock_movement',
  'settlement_movement',
  'money_movement',
  'broker_account',
  'tickets',
  'broker_operations',
  'incoming',
  'warehouse_balance',
  'sales',
  'cash_income',
  'cash_expense',
  'cash_service_operations',
  'client_debt_adjustments',
  'zavod_debt_adjustments',
];

export async function initDb() {
  await publicPool.query(readSql('schema.public.sql'));
  await migrateLegacyData();
  await seedFirstOrganization();
  await seedPlatformAdmin();

  const { rows } = await publicPool.query<{ id: number }>('SELECT id FROM organizations ORDER BY id');
  for (const org of rows) await prepareTenant(org.id);
}

/** Создаёт (идемпотентно) схему организации и приводит её таблицы/настройки в актуальный вид. */
export async function prepareTenant(orgId: number) {
  await publicPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaNameFor(orgId)}"`);
  await runInTenant(orgId, async () => {
    await pool.query(readSql('schema.tenant.sql'));
    await seedSettingsDefaults();
    await loadSettingsCache();
    await backfillLogists();
  });
}

/** Прежняя версия хранила все данные в схеме public. Один раз переносим их в схему первой
 * организации (ALTER TABLE ... SET SCHEMA не копирует и не удаляет строки — только переносит таблицы),
 * целиком в одной транзакции: либо всё, либо ничего. */
async function migrateLegacyData() {
  const { rows: orgs } = await publicPool.query('SELECT 1 FROM organizations LIMIT 1');
  if (orgs.length > 0) return;
  const { rows: legacy } = await publicPool.query(`SELECT to_regclass('public.clients') AS t`);
  if (!legacy[0].t) return;

  const client = await publicPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`INSERT INTO organizations (name, schema_name) VALUES ('Основная организация', 'org_tmp') RETURNING id`);
    const orgId = rows[0].id as number;
    const schema = schemaNameFor(orgId);
    await client.query('UPDATE organizations SET schema_name = $1 WHERE id = $2', [schema, orgId]);
    await client.query(`CREATE SCHEMA "${schema}"`);
    for (const table of TENANT_TABLES) {
      const { rows: exists } = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
      if (exists[0].t) await client.query(`ALTER TABLE public."${table}" SET SCHEMA "${schema}"`);
    }
    await client.query('UPDATE users SET organization_id = $1 WHERE organization_id IS NULL AND is_platform_admin = false', [orgId]);
    await client.query('COMMIT');
    console.log(`Данные перенесены в организацию «Основная организация» (схема ${schema}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Чистая установка: первая организация и её администратор создаются из ADMIN_USERNAME/ADMIN_PASSWORD. */
async function seedFirstOrganization() {
  const { rows } = await publicPool.query('SELECT 1 FROM organizations LIMIT 1');
  if (rows.length > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set — skipping first organization seed.');
    return;
  }
  const { createOrganization } = await import('../modules/platform/service.js');
  await createOrganization({ name: 'Основная организация', adminUsername: username, adminPassword: password, adminFullName: 'Администратор' });
  console.log(`Organization and admin user "${username}" created.`);
}

/** Владелец платформы (создаёт организации) — задаётся переменными PLATFORM_ADMIN_USERNAME/PASSWORD. */
async function seedPlatformAdmin() {
  const username = process.env.PLATFORM_ADMIN_USERNAME;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!username || !password) return;
  const { rows } = await publicPool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (rows.length > 0) return;
  const passwordHash = await bcrypt.hash(password, 10);
  await publicPool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_platform_admin)
     VALUES ($1, $2, 'Владелец платформы', 'admin', true)`,
    [username, passwordHash],
  );
  console.log(`Platform admin "${username}" created.`);
}
