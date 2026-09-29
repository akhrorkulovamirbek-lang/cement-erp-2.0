import type { NextFunction, Request, Response } from 'express';
import type { ResourceCode } from '../core/constants.js';
import { hasPermission, isModuleEnabled } from '../core/settingsCache.js';

/** Раздел 8.2.3 ТЗ: права проверяются на бэкенде для каждого запроса, а не только скрытием кнопок. */
export function requirePermission(resource: ResourceCode) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !hasPermission(role, resource)) {
      res.status(403).json({ error: 'Недостаточно прав для этого действия' });
      return;
    }
    next();
  };
}

/** Для эндпоинтов, которыми пользуются несколько модулей сразу (например остаток склада читают
 * и Приход, и Продажа) — доступ, если разрешён хотя бы один из ресурсов. */
export function requireAnyPermission(...resources: ResourceCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !resources.some((r) => hasPermission(role, r))) {
      res.status(403).json({ error: 'Недостаточно прав для этого действия' });
      return;
    }
    next();
  };
}

/** Раздел 8.3.4 ТЗ: выключенная функция пропадает из меню и форм у всех. */
export function requireModuleEnabled(code: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!isModuleEnabled(code)) {
      res.status(403).json({ error: 'Эта функция отключена в настройках' });
      return;
    }
    next();
  };
}
