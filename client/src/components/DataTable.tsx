import clsx from 'clsx';
import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  extraRowAction?: (row: T) => ReactNode;
  getRowId: (row: T) => number | string;
}

export function DataTable<T>({ columns, rows, loading, emptyMessage = 'Нет записей', onEdit, onDelete, extraRowAction, getRowId }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ru');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns]);

  const hasActions = Boolean(onEdit || onDelete || extraRowAction);

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: 'asc' };
      return { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col)}
                className={clsx(
                  'whitespace-nowrap px-4 py-3 font-medium',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.sortValue && 'cursor-pointer select-none hover:text-slate-800',
                )}
              >
                {col.header}
                {sort?.key === col.key && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
              </th>
            ))}
            {hasActions && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">
                Загрузка…
              </td>
            </tr>
          )}
          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            sorted.map((row) => (
              <tr key={getRowId(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'whitespace-nowrap px-4 py-2.5 text-slate-700',
                      col.align === 'right' && 'text-right tabular-nums',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
                {hasActions && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {extraRowAction?.(row)}
                      {onEdit && (
                        <button onClick={() => onEdit(row)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Изменить">
                          ✏️
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(row)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Удалить">
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
