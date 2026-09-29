import { Router } from 'express';
import { recordAudit } from '../../core/audit.js';
import { RESOURCE_CODES, RESOURCE_LABELS, ROLES, ROLE_LABELS } from '../../core/constants.js';
import { MODULE_REGISTRY } from '../../core/moduleRegistry.js';
import { loadSettingsCache } from '../../core/settingsCache.js';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { setPermissionSchema, toggleModuleSchema, updateAppSettingsSchema } from './schema.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/modules',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT code, enabled FROM module_settings');
    const enabledByCode = Object.fromEntries(rows.map((r) => [r.code, r.enabled]));
    res.json(
      MODULE_REGISTRY.map((m) => ({
        ...m,
        enabled: enabledByCode[m.code] ?? m.defaultEnabled,
      })),
    );
  }),
);

settingsRouter.put(
  '/modules/:code',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { enabled } = toggleModuleSchema.parse(req.body);
    const def = MODULE_REGISTRY.find((m) => m.code === code);
    if (!def) {
      res.status(404).json({ error: 'Модуль не найден' });
      return;
    }
    await pool.query(
      `INSERT INTO module_settings (code, enabled, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (code) DO UPDATE SET enabled = $2, updated_by = $3, updated_at = now()`,
      [code, enabled, req.user!.userId],
    );
    await loadSettingsCache();
    await recordAudit({
      userId: req.user!.userId,
      action: 'update',
      objectType: 'module_setting',
      objectId: code,
      objectLabel: `Модуль «${def.name}» ${enabled ? 'включён' : 'выключен'}`,
      req,
    });
    res.json({ code, enabled });
  }),
);

settingsRouter.get(
  '/permissions',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT role, resource_code, allowed FROM permissions');
    const allowedSet = new Set(rows.filter((r) => r.allowed).map((r) => `${r.role}:${r.resource_code}`));
    const matrix = ROLES.map((role) => ({
      role,
      roleLabel: ROLE_LABELS[role],
      resources: RESOURCE_CODES.map((resourceCode) => ({
        resourceCode,
        resourceLabel: RESOURCE_LABELS[resourceCode],
        allowed: allowedSet.has(`${role}:${resourceCode}`),
      })),
    }));
    res.json(matrix);
  }),
);

settingsRouter.put(
  '/permissions',
  asyncHandler(async (req, res) => {
    const { role, resourceCode, allowed } = setPermissionSchema.parse(req.body);
    if (role === 'admin') {
      res.status(400).json({ error: 'У администратора права нельзя ограничить' });
      return;
    }
    await pool.query(
      `INSERT INTO permissions (role, resource_code, allowed) VALUES ($1, $2, $3)
       ON CONFLICT (role, resource_code) DO UPDATE SET allowed = $3`,
      [role, resourceCode, allowed],
    );
    await loadSettingsCache();
    await recordAudit({
      userId: req.user!.userId,
      action: 'update',
      objectType: 'permission',
      objectId: `${role}:${resourceCode}`,
      objectLabel: `${ROLE_LABELS[role]} · ${RESOURCE_LABELS[resourceCode]}: ${allowed ? 'разрешено' : 'запрещено'}`,
      req,
    });
    res.status(204).end();
  }),
);

settingsRouter.get(
  '/app',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }),
);

settingsRouter.put(
  '/app',
  asyncHandler(async (req, res) => {
    const data = updateAppSettingsSchema.parse(req.body);
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [key, String(value), req.user!.userId],
      );
    }
    await loadSettingsCache();
    await recordAudit({
      userId: req.user!.userId,
      action: 'update',
      objectType: 'app_setting',
      objectLabel: 'Общие настройки',
      after: data,
      req,
    });
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }),
);
