import { z } from 'zod';
import { RESOURCE_CODES, ROLES } from '../../core/constants.js';

export const toggleModuleSchema = z.object({
  enabled: z.coerce.boolean(),
});

export const setPermissionSchema = z.object({
  role: z.enum(ROLES),
  resourceCode: z.enum(RESOURCE_CODES),
  allowed: z.coerce.boolean(),
});

export const updateAppSettingsSchema = z.object({
  session_timeout_minutes: z.coerce.number().int().min(5).max(10080).optional(),
  broker_allow_negative: z.coerce.boolean().optional(),
});
