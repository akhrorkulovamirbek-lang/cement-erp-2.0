import { Router } from 'express';
import { RESOURCE_CODES } from '../../core/constants.js';
import { hasPermission, isModuleEnabled } from '../../core/settingsCache.js';
import { MODULE_REGISTRY } from '../../core/moduleRegistry.js';

/** В отличие от /api/settings/*, эти эндпоинты доступны любому авторизованному пользователю —
 * фронтенду нужно знать СВОИ права и включённые модули, чтобы построить меню, даже если сам
 * раздел «Настройки» ему недоступен. */
export const myAccessRouter = Router();

myAccessRouter.get('/permissions', (req, res) => {
  const role = req.user!.role;
  const resources = Object.fromEntries(RESOURCE_CODES.map((r) => [r, hasPermission(role, r)]));
  res.json({ role, resources });
});

myAccessRouter.get('/modules', (_req, res) => {
  const enabled = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.code, isModuleEnabled(m.code)]));
  res.json(enabled);
});
