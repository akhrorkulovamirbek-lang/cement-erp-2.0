import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '../core/constants.js';
import { getSessionTimeoutMinutes } from '../core/settingsCache.js';
import { runInTenant } from '../db/tenant.js';

export const COOKIE_NAME = 'cement_erp_token';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export interface AuthPayload {
  userId: number;
  username: string;
  role: Role;
  /** Организация пользователя; у владельца платформы её нет. */
  orgId: number | null;
  isPlatformAdmin: boolean;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: `${getSessionTimeoutMinutes(payload.orgId)}m` });
}

export function setAuthCookie(res: Response, token: string, orgId: number | null): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getSessionTimeoutMinutes(orgId) * 60 * 1000,
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/** Раздел 8.1.4 ТЗ: сессия завершается после N часов без активности — не фиксированный TTL,
 * а "скользящее" окно: каждый аутентифицированный запрос продлевает cookie ещё на N минут. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload & { iat: number; exp: number };
    // jwt.verify() returns iat/exp on the decoded object — re-signing that object as-is with
    // `expiresIn` throws ("payload already has an exp property"), so rebuild a clean payload.
    const payload: AuthPayload = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      orgId: decoded.orgId ?? null,
      isPlatformAdmin: Boolean(decoded.isPlatformAdmin),
    };
    req.user = payload;
    setAuthCookie(res, signToken(payload), payload.orgId);
    // Дальше весь запрос работает в схеме организации пользователя (см. db/tenant.ts).
    if (payload.orgId != null) runInTenant(payload.orgId, next);
    else next();
  } catch {
    res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
}

/** Разделы организаций доступны только пользователям организации (владелец платформы их не видит). */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (req.user?.orgId == null) {
    res.status(403).json({ error: 'Этот раздел доступен только пользователям организации' });
    return;
  }
  next();
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isPlatformAdmin) {
    res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    return;
  }
  next();
}
