import { cn } from '@/lib/utils';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periods(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return [
    { label: 'Сегодня', from: iso(day(0)), to: iso(day(0)) },
    { label: 'Вчера', from: iso(day(-1)), to: iso(day(-1)) },
    { label: '7 дней', from: iso(day(-6)), to: iso(day(0)) },
    { label: 'Этот месяц', from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
    { label: 'Прошлый месяц', from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { label: 'Этот год', from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) },
  ];
}

/** Быстрые периоды для фильтра по датам: одно нажатие вместо ручного выбора двух дат. */
export function QuickPeriods({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {periods().map((p) => {
        const active = from === p.from && to === p.to;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => (active ? onChange('', '') : onChange(p.from, p.to))}
            aria-pressed={active}
            className={cn(
              'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
