import clsx from 'clsx';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={clsx(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-emerald-600',
          tone === 'negative' && 'text-red-600',
          tone === 'default' && 'text-slate-900',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
