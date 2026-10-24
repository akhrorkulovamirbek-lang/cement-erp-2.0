import { Router } from 'express';
import { pool, withTransaction } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';
import { saleSchema } from './schema.js';
import { createSale, deleteSale, updateSale } from './service.js';

export const salesRouter = Router();

salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, cement_mark_id, from, to, source, sale_type, deferred, awaiting, q } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (client_id) {
      params.push(Number(client_id));
      conditions.push(`s.client_id = $${params.length}`);
    }
    if (cement_mark_id) {
      params.push(Number(cement_mark_id));
      conditions.push(`s.cement_mark_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`s.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`s.date <= $${params.length}`);
    }
    if (source) {
      params.push(source);
      conditions.push(`s.source = $${params.length}`);
    }
    if (sale_type) {
      params.push(sale_type);
      conditions.push(`s.sale_type = $${params.length}`);
    }
    if (deferred === '1') conditions.push('s.is_deferred = true');
    if (awaiting === '1') conditions.push('s.awaiting_shipment = true');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS client_name, z.name AS zavod_name, cm.name AS cement_mark_name,
              t.ticket_number, ov.number AS own_vehicle_number, f.name AS factory_name
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN zavody z ON z.id = s.zavod_id
       LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id
       LEFT JOIN tickets t ON t.id = s.ticket_id
       LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
       LEFT JOIN factories f ON f.id = s.factory_id
       ${where}
       ORDER BY s.date DESC, s.id DESC`,
      params,
    );
    if (q) {
      // Поиск по машине: номер или перевозчик. Регистр и пробелы сравниваем в JS —
      // так кириллица находится независимо от настроек локали базы.
      const needle = String(q).replace(/\s+/g, '').toUpperCase();
      const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
      res.json(rows.filter((r) => [r.machine_number, r.own_vehicle_number, r.carrier_name].some((v) => norm(v).includes(needle))));
      return;
    }
    res.json(rows);
  }),
);

salesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = saleSchema.parse(req.body);
    const row = await withTransaction((client) => createSale(client, data));
    res.status(201).json(row);
  }),
);

// Одно нажатие «Отгрузить»: снимает пометку «ждёт отгрузки».
salesRouter.post(
  '/:id/ship',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('UPDATE sales SET awaiting_shipment = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) throw notFound('Продажа не найдена');
    res.json(rows[0]);
  }),
);

salesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = saleSchema.parse(req.body);
    const row = await withTransaction((client) => updateSale(client, Number(req.params.id), data));
    res.json(row);
  }),
);

salesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction((client) => deleteSale(client, Number(req.params.id)));
    res.status(204).end();
  }),
);
