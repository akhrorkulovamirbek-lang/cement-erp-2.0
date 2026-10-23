import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

const { Pool } = pg;

// DATE columns (oid 1082) default to JS Date objects parsed at local midnight, which then
// shift by a day when serialized to JSON and re-parsed in a different timezone. We never do
// date arithmetic in JS on these — return the raw 'YYYY-MM-DD' string instead.
pg.types.setTypeParser(1082, (value: string) => value);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}
const ssl = connectionString.includes('localhost') ? false : { rejectUnauthorized: false };

interface TenantContext {
  orgId: number;
  schema: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Общий пул: реестр организаций и пользователи (схема public). */
export const publicPool = new Pool({ connectionString, ssl, max: 4, idleTimeoutMillis: 30_000 });

const tenantPools = new Map<string, pg.Pool>();

export function schemaNameFor(orgId: number): string {
  return `org_${orgId}`;
}

/** Отдельный пул на организацию: каждое соединение сразу получает search_path на её схему, поэтому
 * весь остальной код работает с обычными именами таблиц и не знает про организации. */
function tenantPool(schema: string): pg.Pool {
  let p = tenantPools.get(schema);
  if (!p) {
    p = new Pool({ connectionString, ssl, max: 5, idleTimeoutMillis: 30_000 });
    p.on('connect', (client) => {
      client.query(`SET search_path TO "${schema}", public`).catch((err) => console.error('search_path:', err));
    });
    tenantPools.set(schema, p);
  }
  return p;
}

export function runInTenant<T>(orgId: number, fn: () => T): T {
  return storage.run({ orgId, schema: schemaNameFor(orgId) }, fn);
}

export function currentOrgId(): number | null {
  return storage.getStore()?.orgId ?? null;
}

/** Пул текущей организации (из контекста запроса), а вне контекста — общий. */
export function currentPool(): pg.Pool {
  const ctx = storage.getStore();
  return ctx ? tenantPool(ctx.schema) : publicPool;
}
