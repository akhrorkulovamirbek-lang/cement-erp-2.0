import type pg from 'pg';
import { currentPool, publicPool } from './tenant.js';

/** Все модули ходят в БД через `pool`: внутри запроса авторизованного пользователя он сам ведёт в
 * схему его организации, а вне контекста (вход, реестр организаций) — в общую схему. */
export const pool: pg.Pool = new Proxy(publicPool, {
  get(target, prop, receiver) {
    if (prop === 'query' || prop === 'connect') {
      const current = currentPool();
      const value = (current as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function' ? value.bind(current) : value;
    }
    return Reflect.get(target, prop, receiver);
  },
});

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
