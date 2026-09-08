import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { badRequest } from '../../lib/errors.js';
import { COOKIE_NAME, requireAuth, signToken } from '../../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) throw badRequest('Неверный логин или пароль');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw badRequest('Неверный логин или пароль');

    const token = signToken({ userId: user.id, username: user.username });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ username: user.username });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user!.username });
});
