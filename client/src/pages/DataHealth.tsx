import { Check, ChevronDown, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataHealth, type HealthCheck } from '@/api/modules';
import { Badge } from '@/components/Badge';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SEVERITY = {
  high: { label: 'Важно исправить', tone: 'red' as const },
  medium: { label: 'Стоит проверить', tone: 'amber' as const },
  low: { label: 'К сведению', tone: 'slate' as const },
};

function CheckCard({ c }: { c: HealthCheck }) {
  const [open, setOpen] = useState(c.severity === 'high');
  const sev = SEVERITY[c.severity];
  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left">
        <ShieldAlert className={cn('mt-0.5 size-5 shrink-0', c.severity === 'high' ? 'text-destructive' : c.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground')} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.title}</span>
            <Badge tone={sev.tone}>{sev.label}</Badge>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">Найдено: {c.count}</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-4 text-sm">
          <p>
            <b>Чем это плохо.</b> {c.why}
          </p>
          <p>
            <b>Что делать.</b> {c.fix}
          </p>
          <div className="overflow-hidden rounded-lg border">
            {c.items.map((it, i) => (
              <div key={i} className="border-b px-3 py-2 last:border-0">
                <div className="font-medium">{it.title}</div>
                <div className="text-muted-foreground">{it.detail}</div>
              </div>
            ))}
            {c.count > c.items.length && <div className="bg-muted/40 px-3 py-2 text-muted-foreground">…и ещё {c.count - c.items.length}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** «Контроль данных»: сам ищет то, что молча искажает отчёты, и объясняет, что с этим делать. Ничего не меняет. */
export function DataHealth() {
  const health = useDataHealth();
  const checks = health.data?.checks ?? [];
  const bad = checks.filter((c) => c.count > 0);
  const good = checks.filter((c) => c.count === 0);
  const serious = bad.filter((c) => c.severity === 'high').length;

  return (
    <div>
      <Link to="/reports" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Отчёты
      </Link>
      <PageHeader
        title="Контроль данных"
        subtitle="Система сама ищет ошибки и пропуски, из-за которых отчёты и карточки могут показывать неверные цифры"
        action={
          <Button variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? 'Проверяю…' : 'Проверить заново'}
          </Button>
        }
      />

      {health.isLoading && <p className="text-sm text-muted-foreground">Проверяю данные…</p>}

      {health.data && (
        <>
          <div
            className={cn(
              'mb-5 rounded-xl border p-4 text-sm',
              bad.length === 0 ? 'border-emerald-600/30 bg-emerald-600/10' : serious > 0 ? 'border-destructive/30 bg-destructive/10' : 'border-amber-500/30 bg-amber-500/10',
            )}
          >
            {bad.length === 0 ? (
              <>Проверено {checks.length} видов ошибок — ничего подозрительного не найдено.</>
            ) : (
              <>
                Проверено <b>{checks.length}</b> видов ошибок. Найдено подозрительного: <b>{bad.length}</b>
                {serious > 0 && (
                  <>
                    , из них <b>{serious}</b> важных
                  </>
                )}
                . Раскройте каждый пункт: там написано, чем это плохо и что делать. Если запись в порядке (так и задумано) — ничего менять не нужно.
              </>
            )}
          </div>

          {bad.length > 0 && (
            <div className="mb-6 space-y-3">
              {bad.map((c) => (
                <CheckCard key={c.key} c={c} />
              ))}
            </div>
          )}

          {good.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Проверено — всё в порядке ({good.length})</h2>
              <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {good.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {c.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
