import { Router } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from './asyncHandler.js';
import { conflict, notFound } from './errors.js';
import { nameKey } from './nameKey.js';

// Справочники, где два «одинаковых на вид» названия — почти всегда ошибка (операции раздваиваются между карточками).
const NO_LOOKALIKES = new Set(['zavody', 'clients', 'factories', 'cement_marks']);
const LABELS: Record<string, string> = { zavody: 'поставщик', clients: 'клиент', factories: 'завод', cement_marks: 'марка' };

async function assertNoLookalike(table: string, name: unknown, selfId?: number) {
  if (!NO_LOOKALIKES.has(table) || typeof name !== 'string') return;
  const key = nameKey(name);
  const { rows } = await pool.query(`SELECT id, name FROM ${table}`);
  // Правка существующей записи без смены имени не блокируется, даже если «двойник» уже есть — его нужно объединить отдельно.
  const self = selfId !== undefined ? rows.find((r) => r.id === selfId) : undefined;
  if (self && nameKey(String(self.name)) === key) return;
  const twin = rows.find((r) => r.id !== selfId && nameKey(String(r.name)) === key);
  if (twin) throw conflict(`Похожий ${LABELS[table]} уже есть: «${twin.name}». Выберите его из списка, чтобы не создавать дубль.`);
}

interface PgError {
  code?: string;
}

interface RefModuleOptions<T extends ZodTypeAny> {
  table: string;
  /** Insertable/updatable columns, in the order the schema produces them. */
  columns: string[];
  schema: T;
  /** Column used for ILIKE search via ?q= */
  searchColumn?: string;
}

export function createRefRouter<T extends ZodTypeAny>(opts: RefModuleOptions<T>) {
  const router = Router();
  const cols = opts.columns;

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = req.query.q as string | undefined;
      let sql = `SELECT * FROM ${opts.table}`;
      const params: unknown[] = [];
      if (q && opts.searchColumn) {
        params.push(`%${q}%`);
        sql += ` WHERE ${opts.searchColumn} ILIKE $1`;
      }
      sql += ' ORDER BY id DESC';
      const { rows } = await pool.query(sql, params);
      res.json(rows);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = opts.schema.parse(req.body) as z.infer<T> & Record<string, unknown>;
      await assertNoLookalike(opts.table, data.name);
      const values = cols.map((c) => data[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${opts.table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      try {
        const { rows } = await pool.query(sql, values);
        res.status(201).json(rows[0]);
      } catch (err) {
        if ((err as PgError).code === '23505') throw conflict('Запись с таким названием уже существует');
        throw err;
      }
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const data = opts.schema.parse(req.body) as z.infer<T> & Record<string, unknown>;
      await assertNoLookalike(opts.table, data.name, id);
      const values = cols.map((c) => data[c]);
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const sql = `UPDATE ${opts.table} SET ${setClause} WHERE id = $${cols.length + 1} RETURNING *`;
      try {
        const { rows } = await pool.query(sql, [...values, id]);
        if (!rows[0]) throw notFound('Запись не найдена');
        res.json(rows[0]);
      } catch (err) {
        if ((err as PgError).code === '23505') throw conflict('Запись с таким названием уже существует');
        throw err;
      }
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      try {
        const { rowCount } = await pool.query(`DELETE FROM ${opts.table} WHERE id = $1`, [id]);
        if (!rowCount) throw notFound('Запись не найдена');
        res.status(204).end();
      } catch (err) {
        if ((err as PgError).code === '23503') throw conflict('Нельзя удалить — запись используется в других данных');
        throw err;
      }
    }),
  );

  return router;
}
