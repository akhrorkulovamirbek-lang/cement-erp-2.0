import { Router } from 'express';
import { z } from 'zod';
import { publicPool } from '../../db/tenant.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { notFound } from '../../lib/errors.js';
import { createOrganization } from './service.js';

export const platformRouter = Router();

platformRouter.get(
  '/organizations',
  asyncHandler(async (_req, res) => {
    const { rows } = await publicPool.query(
      `SELECT o.id, o.name, o.active, o.created_at,
              COUNT(u.id)::int AS users_count,
              (SELECT string_agg(a.username, ', ') FROM users a WHERE a.organization_id = o.id AND a.role = 'admin') AS admins
       FROM organizations o LEFT JOIN users u ON u.organization_id = o.id
       GROUP BY o.id ORDER BY o.id`,
    );
    res.json(rows);
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название организации'),
  adminUsername: z.string().trim().min(3, 'Логин — не короче 3 символов'),
  adminPassword: z.string().min(6, 'Пароль — не короче 6 символов'),
  adminFullName: z.string().trim().optional(),
});

platformRouter.post(
  '/organizations',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const org = await createOrganization(data);
    res.status(201).json(org);
  }),
);

const updateSchema = z.object({ name: z.string().trim().min(1).optional(), active: z.boolean().optional() });

platformRouter.put(
  '/organizations/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const { rows } = await publicPool.query(
      `UPDATE organizations SET name = COALESCE($1, name), active = COALESCE($2, active) WHERE id = $3 RETURNING id, name, active`,
      [data.name ?? null, data.active ?? null, req.params.id],
    );
    if (!rows[0]) throw notFound('Организация не найдена');
    res.json(rows[0]);
  }),
);
