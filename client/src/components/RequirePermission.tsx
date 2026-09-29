import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';

/** Скрывает раздел, если у роли нет права — бэкенд всё равно проверяет права на каждый запрос
 * (раздел 8.2.3 ТЗ), это только чтобы не показывать пустой/ломающийся экран. */
export function RequirePermission({ resource, children }: { resource: string; children: ReactNode }) {
  const { allowed, loading } = usePermission(resource);
  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
