import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { recordAudit } from '../../core/audit.js';
import { publicPool as pool } from '../../db/tenant.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from './schema.js';

export const usersRouter = Router();

const SAFE_COLUMNS = 'id, username, full_name, role, phone, active, created_at, updated_at';
// Пользователи общие на всю систему (схема public), но каждая организация видит и правит только своих.

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE organization_id = $1 ORDER BY id DESC`, [req.user!.orgId]);
    res.json(rows);
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role, phone, active, created_by, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${SAFE_COLUMNS}`,
        [data.username, passwordHash, data.fullName, data.role, data.phone, data.active, req.user!.userId, req.user!.orgId],
      );
      await recordAudit({
        userId: req.user!.userId,
        action: 'create',
        objectType: 'user',
        objectId: rows[0].id,
        objectLabel: `Пользователь «${rows[0].full_name}»`,
        after: rows[0],
        req,
      });
      res.status(201).json(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('Пользователь с таким логином уже существует');
      throw err;
    }
  }),
);

usersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = updateUserSchema.parse(req.body);
    const before = (await pool.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1 AND organization_id = $2`, [id, req.user!.orgId])).rows[0];
    if (!before) throw notFound('Пользователь не найден');
    if (id === req.user!.userId && data.active === false) {
      throw badRequest('Нельзя деактивировать самого себя');
    }

    const { rows } = await pool.query(
      `UPDATE users SET full_name = $1, role = $2, phone = $3, active = $4, updated_by = $5, updated_at = now()
       WHERE id = $6 AND organization_id = $7
       RETURNING ${SAFE_COLUMNS}`,
      [data.fullName, data.role, data.phone, data.active, req.user!.userId, id, req.user!.orgId],
    );
    await recordAudit({
      userId: req.user!.userId,
      action: 'update',
      objectType: 'user',
      objectId: id,
      objectLabel: `Пользователь «${rows[0].full_name}»`,
      before,
      after: rows[0],
      req,
    });
    res.json(rows[0]);
  }),
);

usersRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { newPassword } = resetPasswordSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE id = $2 AND organization_id = $3 RETURNING ${SAFE_COLUMNS}`,
      [passwordHash, id, req.user!.orgId],
    );
    if (!rows[0]) throw notFound('Пользователь не найден');
    await recordAudit({
      userId: req.user!.userId,
      action: 'reset_password',
      objectType: 'user',
      objectId: id,
      objectLabel: `Пользователь «${rows[0].full_name}»`,
      req,
    });
    res.status(204).end();
  }),
);
