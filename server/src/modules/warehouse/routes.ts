import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const warehouseRouter = Router();

warehouseRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT wb.*, cm.name AS cement_mark_name
       FROM warehouse_balance wb
       JOIN cement_marks cm ON cm.id = wb.cement_mark_id
       WHERE wb.tonnage > 0.001
       ORDER BY cm.name, wb.type`,
    );
    res.json(rows);
  }),
);
