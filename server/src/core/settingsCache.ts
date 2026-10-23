import { pool } from '../db/pool.js';
import { currentOrgId } from '../db/tenant.js';
import { DEFAULT_PERMISSIONS, RESOURCE_CODES, ROLES, type ResourceCode, type Role } from './constants.js';
import { MODULE_REGISTRY } from './moduleRegistry.js';

/** In-memory mirror of permissions/module_settings/app_settings организации, перезагружается при каждой
 * записи из экрана Настроек — чтобы не ходить в БД на каждый запрос. Кэш свой у каждой организации. */
interface OrgSettings {
  permissions: Record<Role, Set<ResourceCode>>;
  moduleEnabled: Record<string, boolean>;
  appSettings: Record<string, string>;
}

const cache = new Map<number, OrgSettings>();

function buildDefaultPermissions(): Record<Role, Set<ResourceCode>> {
  const result = {} as Record<Role, Set<ResourceCode>>;
  for (const role of ROLES) result[role] = new Set(DEFAULT_PERMISSIONS[role]);
  return result;
}

function defaults(): OrgSettings {
  return { permissions: buildDefaultPermissions(), moduleEnabled: {}, appSettings: {} };
}

function settingsFor(orgId?: number | null): OrgSettings {
  const id = orgId ?? currentOrgId();
  return (id != null ? cache.get(id) : undefined) ?? defaults();
}

/** Грузит настройки организации из текущего контекста (запрос или runInTenant). */
export async function loadSettingsCache(): Promise<void> {
  const orgId = currentOrgId();
  if (orgId == null) throw new Error('loadSettingsCache вызван вне контекста организации');
  const [permRes, modRes, appRes] = await Promise.all([
    pool.query<{ role: Role; resource_code: ResourceCode; allowed: boolean }>('SELECT role, resource_code, allowed FROM permissions'),
    pool.query<{ code: string; enabled: boolean }>('SELECT code, enabled FROM module_settings'),
    pool.query<{ key: string; value: string }>('SELECT key, value FROM app_settings'),
  ]);

  const next = buildDefaultPermissions();
  for (const row of permRes.rows) {
    if (!next[row.role]) continue;
    if (row.allowed) next[row.role].add(row.resource_code);
    else next[row.role].delete(row.resource_code);
  }

  const nextModules: Record<string, boolean> = {};
  for (const m of MODULE_REGISTRY) nextModules[m.code] = m.defaultEnabled;
  for (const row of modRes.rows) nextModules[row.code] = row.enabled;

  cache.set(orgId, {
    permissions: next,
    moduleEnabled: nextModules,
    appSettings: Object.fromEntries(appRes.rows.map((r) => [r.key, r.value])),
  });
}

export async function seedSettingsDefaults(): Promise<void> {
  for (const role of ROLES) {
    for (const resource of RESOURCE_CODES) {
      const allowed = DEFAULT_PERMISSIONS[role].includes(resource);
      await pool.query(
        `INSERT INTO permissions (role, resource_code, allowed) VALUES ($1, $2, $3)
         ON CONFLICT (role, resource_code) DO NOTHING`,
        [role, resource, allowed],
      );
    }
  }
  for (const m of MODULE_REGISTRY) {
    await pool.query(
      `INSERT INTO module_settings (code, enabled) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
      [m.code, m.defaultEnabled],
    );
  }
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('session_timeout_minutes', '720')
     ON CONFLICT (key) DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('broker_allow_negative', 'false')
     ON CONFLICT (key) DO NOTHING`,
  );
}

export function hasPermission(role: Role, resource: ResourceCode): boolean {
  return settingsFor().permissions[role]?.has(resource) ?? false;
}

export function isModuleEnabled(code: string): boolean {
  return settingsFor().moduleEnabled[code] ?? true;
}

export function getAppSetting(key: string, fallback: string, orgId?: number | null): string {
  return settingsFor(orgId).appSettings[key] ?? fallback;
}

export function getSessionTimeoutMinutes(orgId?: number | null): number {
  const raw = Number(getAppSetting('session_timeout_minutes', '720', orgId));
  return Number.isFinite(raw) && raw > 0 ? raw : 720;
}

export function getBrokerAllowNegative(): boolean {
  return getAppSetting('broker_allow_negative', 'false') === 'true';
}
