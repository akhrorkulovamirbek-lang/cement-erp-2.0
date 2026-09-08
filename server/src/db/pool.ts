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

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
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
