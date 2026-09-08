import { Router } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from './asyncHandler.js';
import { conflict, notFound } from './errors.js';

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
