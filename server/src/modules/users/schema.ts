import { z } from 'zod';
import { ROLES } from '../../core/constants.js';

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО'),
  username: z.string().trim().min(3, 'Логин должен быть не короче 3 символов'),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов'),
  role: z.enum(ROLES),
  phone: z.string().trim().optional().nullable().default(null),
  active: z.coerce.boolean().default(true),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО'),
  role: z.enum(ROLES),
  phone: z.string().trim().optional().nullable().default(null),
  active: z.coerce.boolean(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Пароль должен быть не короче 6 символов'),
});
