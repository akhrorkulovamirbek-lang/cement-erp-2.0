import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

export const auditLogRouter = Router();

auditLogRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, userId, action, objectType, page, pageSize } = req.query as Record<string, string | undefined>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (from) {
      params.push(from);
      conditions.push(`al.at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`al.at < ($${params.length}::date + interval '1 day')`);
    }
    if (userId) {
      params.push(Number(userId));
      conditions.push(`al.user_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`al.action = $${params.length}`);
    }
    if (objectType) {
      params.push(objectType);
      conditions.push(`al.object_type = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = Math.min(Number(pageSize) || 50, 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM audit_log al ${where}`, params);
    const listParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT al.*, u.full_name AS user_full_name, u.username AS user_username
       FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );
    res.json({ rows, total: countRes.rows[0].count, page: Number(page) || 1, pageSize: limit });
  }),
);
