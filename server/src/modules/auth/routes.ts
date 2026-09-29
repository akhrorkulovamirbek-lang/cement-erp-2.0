import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../../core/audit.js';
import type { Role } from '../../core/constants.js';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { badRequest } from '../../lib/errors.js';
import { COOKIE_NAME, requireAuth, setAuthCookie, signToken } from '../../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];

    if (!user) {
      await recordAudit({ userId: null, action: 'login_failed', objectType: 'user', objectLabel: username, req });
      throw badRequest('Неверный логин или пароль');
    }
    if (!user.active) {
      await recordAudit({ userId: user.id, action: 'login_blocked_inactive', objectType: 'user', objectId: user.id, objectLabel: username, req });
      throw badRequest('Пользователь деактивирован');
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      await recordAudit({ userId: user.id, action: 'login_blocked', objectType: 'user', objectId: user.id, objectLabel: username, req });
      throw badRequest(`Слишком много попыток входа. Попробуйте снова через ${minutesLeft} мин.`);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const nextCount = user.failed_login_count + 1;
      if (nextCount >= MAX_FAILED_ATTEMPTS) {
        await pool.query(
          `UPDATE users SET failed_login_count = 0, locked_until = now() + interval '${LOCK_MINUTES} minutes' WHERE id = $1`,
          [user.id],
        );
        await recordAudit({ userId: user.id, action: 'login_locked', objectType: 'user', objectId: user.id, objectLabel: username, req });
      } else {
        await pool.query('UPDATE users SET failed_login_count = $1 WHERE id = $2', [nextCount, user.id]);
        await recordAudit({ userId: user.id, action: 'login_failed', objectType: 'user', objectId: user.id, objectLabel: username, req });
      }
      throw badRequest('Неверный логин или пароль');
    }

    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [user.id]);

    const token = signToken({ userId: user.id, username: user.username, role: user.role as Role });
    setAuthCookie(res, token);
    await recordAudit({ userId: user.id, action: 'login_success', objectType: 'user', objectId: user.id, objectLabel: username, req });
    res.json({ username: user.username, role: user.role as Role, fullName: user.full_name });
  }),
);

authRouter.post('/logout', requireAuth, (req, res) => {
  void recordAudit({ userId: req.user!.userId, action: 'logout', objectType: 'user', objectId: req.user!.userId, objectLabel: req.user!.username, req });
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT username, role, full_name FROM users WHERE id = $1', [req.user!.userId]);
    if (!rows[0]) {
      res.status(401).json({ error: 'Сессия истекла, войдите снова' });
      return;
    }
    res.json({ username: rows[0].username, role: rows[0].role as Role, fullName: rows[0].full_name });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Пароль должен быть не короче 6 символов'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user!.userId]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(currentPassword, user.password_hash));
    if (!ok) throw badRequest('Текущий пароль указан неверно');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    await recordAudit({ userId: user.id, action: 'change_password', objectType: 'user', objectId: user.id, objectLabel: user.username, req });
    res.status(204).end();
  }),
);
