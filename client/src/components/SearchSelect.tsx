import { Check, ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SearchOption {
  value: string;
  label: string;
}

/** Выпадающий список с поиском: открыли, начали печатать — список сам сужается. Enter выбирает первый
 * найденный, стрелки двигают выбор. Подходит для длинных списков (клиенты, поставщики, марки, машины). */
export function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder = '—',
  disabled,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(v: string) {
    onValueChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          !selected && 'text-muted-foreground',
          className,
        )}
      >
        <span className="line-clamp-1 text-left">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[active]) choose(filtered[active].value);
              }
            }}
            placeholder="Начните вводить для поиска…"
            className="mb-1 h-9 w-full rounded-sm border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
          />
          <div ref={listRef} className="max-h-64 overflow-y-auto" role="listbox">
            {filtered.length === 0 && <div className="px-2 py-3 text-center text-sm text-muted-foreground">Ничего не найдено</div>}
            {filtered.map((o, i) => (
              <button
                key={o.value || '__empty__'}
                type="button"
                role="option"
                aria-selected={o.value === value}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="line-clamp-2">{o.label}</span>
                {o.value === value && <Check className="size-4 shrink-0" />}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
