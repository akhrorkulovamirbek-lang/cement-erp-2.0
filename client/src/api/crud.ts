import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from './client';

/** Generic list/create/update/delete hooks for a REST resource, to avoid re-writing the same
 * four react-query hooks for every reference/transaction module. */
export function createCrudHooks<T extends { id: number }, TInput = Partial<T>>(
  key: string,
  basePath: string,
  /** Extra query keys to invalidate on write — for resources whose mutations affect other
   * screens too (e.g. a sale changes warehouse stock and dashboard totals). */
  invalidateAlso: string[] = [],
) {
  const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: [key] });
    for (const k of invalidateAlso) qc.invalidateQueries({ queryKey: [k] });
  };

  function useList(params: Record<string, string | number | undefined | null> = {}) {
    return useQuery({
      queryKey: [key, params],
      queryFn: () => api.get<T[]>(`${basePath}${buildQuery(params)}`),
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (data: TInput) => api.post<T>(basePath, data),
      onSuccess: () => invalidate(qc),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: number; data: TInput }) => api.put<T>(`${basePath}/${id}`, data),
      onSuccess: () => invalidate(qc),
    });
  }

  function useDelete() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: number) => api.delete<void>(`${basePath}/${id}`),
      onSuccess: () => invalidate(qc),
    });
  }

  return { useList, useCreate, useUpdate, useDelete };
}
