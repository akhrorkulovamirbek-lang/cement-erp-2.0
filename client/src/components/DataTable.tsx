import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
  /** Строка итогов внизу таблицы — один элемент на колонку, в том же порядке, что columns.
   * Пропустить ячейку — пустая строка/null. Скрывается сама при загрузке/пустом списке. */
  footer?: ReactNode[];
  /** Строка поиска над таблицей: ищет по всем текстовым и числовым полям записи. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyMessage = 'Нет записей',
  onEdit,
  onDelete,
  extraRowAction,
  getRowId,
  footer,
  searchable,
  searchPlaceholder = 'Поиск…',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return rows;
    return rows.filter((row) =>
      Object.values(row as Record<string, unknown>).some(
        (v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q),
      ),
    );
  }, [rows, query, searchable]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ru');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  const hasActions = Boolean(onEdit || onDelete || extraRowAction);

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: 'asc' };
      return { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  const cardRows = !loading ? sorted : [];

  return (
    <>
    {searchable && (
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="mb-3 w-full sm:max-w-xs"
      />
    )}
    {/* Телефон: каждая запись — карточка «поле: значение», а не широкая таблица с прокруткой. */}
    <div className="space-y-2 md:hidden">
      {loading && <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">Загрузка…</div>}
      {!loading && cardRows.length === 0 && (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      )}
      {cardRows.map((row) => (
        <div key={getRowId(row)} className="rounded-lg border bg-card p-3 text-sm shadow-xs">
          <dl className="space-y-1.5">
            {columns.map((col) => {
              const content = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '');
              if (content === '' || content === null || content === undefined) return null;
              return (
                <div key={col.key} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{col.header}</dt>
                  <dd className="min-w-0 text-right font-medium break-words tabular-nums">{content}</dd>
                </div>
              );
            })}
          </dl>
          {hasActions && (
            <div className="mt-2 flex justify-end gap-1 border-t pt-2">
              {extraRowAction?.(row)}
              {onEdit && (
                <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                  <Pencil className="size-4" /> Изменить
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" onClick={() => onDelete(row)}>
                  <Trash2 className="size-4" /> Удалить
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      {footer && !loading && sorted.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm font-medium">
          <div className="space-y-1.5">
            {columns.map((col, i) =>
              footer[i] ? (
                <div key={col.key} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className="text-right tabular-nums">{footer[i]}</span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>

    <div className="hidden overflow-x-auto rounded-md border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => toggleSort(col)}
                className={cn(
                  'whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.sortValue && 'cursor-pointer select-none',
                )}
              >
                <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                  {col.header}
                  {col.sortValue &&
                    (sort?.key === col.key ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3.5 opacity-40" />
                    ))}
                </span>
              </TableHead>
            ))}
            {hasActions && <TableHead className="w-[1%]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {!loading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            sorted.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap',
                      col.align === 'right' && 'text-right tabular-nums',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {extraRowAction?.(row)}
                      {onEdit && (
                        <Button variant="ghost" size="icon" onClick={() => onEdit(row)} aria-label="Изменить">
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(row)} aria-label="Удалить">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
        </TableBody>
        {footer && !loading && sorted.length > 0 && (
          <TableFooter>
            <TableRow>
              {columns.map((col, i) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  {footer[i]}
                </TableCell>
              ))}
              {hasActions && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
    </>
  );
}
