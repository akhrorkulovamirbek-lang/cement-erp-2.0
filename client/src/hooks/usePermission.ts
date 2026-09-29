import { useMyPermissions } from '@/api/modules';

/** Права проверяются и на бэкенде (403), это только для скрытия пунктов меню/кнопок. */
export function usePermission(resource: string): { allowed: boolean; loading: boolean } {
  const { data, isLoading } = useMyPermissions();
  return { allowed: data ? Boolean(data.resources[resource]) : false, loading: isLoading };
}
