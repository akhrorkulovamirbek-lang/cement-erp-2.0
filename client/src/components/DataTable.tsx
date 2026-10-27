import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Filter, Pencil, Trash2 } from 'lucide-react';
import { Popover } from 'radix-ui';
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
  footer?: ReactNode[] | ((visibleRows: T[]) => ReactNode[]);
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
  // Фильтры по колонкам как в Excel: для колонки хранится набор РАЗРЕШЁННЫХ значений.
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  // Скрытые колонки запоминаются в браузере отдельно для каждой таблицы (ключ — набор её колонок).
  const storageKey = `dt.hidden.${columns.map((c) => c.key).join(',')}`;
  const [hidden, setHiddenState] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
    } catch {
      return new Set<string>();
    }
  });
  function setHidden(next: Set<string>) {
    setHiddenState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* без памяти браузера скрытие просто не запомнится */
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows;
    if (searchable && q) {
      result = result.filter((row) =>
        Object.values(row as Record<string, unknown>).some(
          (v) => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q),
        ),
      );
    }
    for (const [key, allowed] of Object.entries(colFilters)) {
      const col = columns.find((c) => c.key === key);
      if (!col?.sortValue) continue;
      result = result.filter((row) => allowed.has(String(col.sortValue!(row))));
    }
    return result;
  }, [rows, query, searchable, colFilters, columns]);

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
  const footerCells = footer ? (typeof footer === 'function' ? footer(sorted) : footer) : null;
  const activeFilters = Object.keys(colFilters).length;
  // Колонки, которые видны сейчас (с исходным номером — по нему подбираются ячейки строки итогов).
  const visible = columns.map((col, i) => ({ col, i })).filter(({ col }) => !hidden.has(col.key));
  const showColumnsButton = columns.length >= 3;

  return (
    <>
    {(searchable || showColumnsButton) && (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchable && (
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="w-full sm:max-w-xs" />
        )}
        {showColumnsButton && (
          <ColumnsMenu columns={columns} hidden={hidden} onChange={setHidden} />
        )}
      </div>
    )}
    {activeFilters > 0 && (
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        Фильтров включено: {activeFilters}
        <button type="button" className="text-primary hover:underline" onClick={() => setColFilters({})}>
          Сбросить все
        </button>
      </div>
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
            {visible.map(({ col }) => {
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
      {footerCells && !loading && sorted.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm font-medium">
          <div className="space-y-1.5">
            {visible.map(({ col, i }) =>
              footerCells[i] ? (
                <div key={col.key} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className="text-right tabular-nums">{footerCells[i]}</span>
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
            {visible.map(({ col }) => (
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
                  {col.sortValue && (
                    <ColumnFilter
                      values={distinct(rows, col)}
                      selected={colFilters[col.key]}
                      onChange={(next) =>
                        setColFilters((prev) => {
                          const copy = { ...prev };
                          if (next) copy[col.key] = next;
                          else delete copy[col.key];
                          return copy;
                        })
                      }
                    />
                  )}
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
              <TableCell colSpan={visible.length + 1} className="h-24 text-center text-muted-foreground">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {!loading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={visible.length + 1} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            sorted.map((row) => (
              <TableRow key={getRowId(row)}>
                {visible.map(({ col }) => (
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
        {footerCells && !loading && sorted.length > 0 && (
          <TableFooter>
            <TableRow>
              {visible.map(({ col, i }) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  {footerCells[i]}
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

function distinct<T>(rows: T[], col: Column<T>): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(String(col.sortValue!(r)));
  return [...set].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

/** Воронка в заголовке колонки: список уникальных значений с галочками, поиск по списку,
 * «Выделить все» / «Очистить». Пустой набор = фильтра нет. */
function ColumnFilter({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: Set<string> | undefined;
  onChange: (next: Set<string> | null) => void;
}) {
  const [search, setSearch] = useState('');
  const shown = values.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()));
  const label = (v: string) => {
    if (v === '') return '(пусто)';
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
  };
  const isOn = (v: string) => (selected ? selected.has(v) : true);

  function toggle(v: string) {
    const next = new Set(selected ?? values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next.size === values.length ? null : next);
  }
  function setShown(on: boolean) {
    const next = new Set(selected ?? values);
    for (const v of shown) (on ? next.add(v) : next.delete(v));
    onChange(next.size === values.length ? null : next);
  }

  return (
    <Popover.Root onOpenChange={(o) => !o && setSearch('')}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Фильтр"
          className={cn('rounded p-0.5 hover:bg-muted', selected ? 'text-primary' : 'text-muted-foreground opacity-50 hover:opacity-100')}
        >
          <Filter className={cn('size-3.5', selected && 'fill-current')} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-[70] w-64 rounded-md border bg-popover p-2 text-sm font-normal text-popover-foreground shadow-md"
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className="mb-2 h-8" autoFocus />
          <div className="mb-1 flex gap-3 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => setShown(true)}>
              Выделить все
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => setShown(false)}>
              Очистить
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {shown.length === 0 && <div className="p-2 text-center text-muted-foreground">Ничего не найдено</div>}
            {shown.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
                <input type="checkbox" checked={isOn(v)} onChange={() => toggle(v)} />
                <span className="truncate">{label(v)}</span>
              </label>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Кнопка «Колонки»: галочками выбираем, какие колонки показывать. Хотя бы одна всегда остаётся. */
function ColumnsMenu<T>({ columns, hidden, onChange }: { columns: Column<T>[]; hidden: Set<string>; onChange: (next: Set<string>) => void }) {
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else if (columns.length - next.size > 1) next.add(key);
    onChange(next);
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="size-4" />
          Колонки{hidden.size > 0 ? ` (скрыто ${hidden.size})` : ''}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-[70] w-64 rounded-md border bg-popover p-2 text-sm text-popover-foreground shadow-md">
          <div className="mb-1 flex items-center justify-between px-1.5 text-xs text-muted-foreground">
            <span>Показывать колонки</span>
            {hidden.size > 0 && (
              <button type="button" className="text-primary hover:underline" onClick={() => onChange(new Set())}>
                Показать все
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {columns.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 hover:bg-muted">
                <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} />
                <span className="truncate">{c.header || c.key}</span>
              </label>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
