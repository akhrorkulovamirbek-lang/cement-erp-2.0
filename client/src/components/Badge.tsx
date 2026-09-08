import clsx from 'clsx';

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-brand-100 text-brand-700',
};

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>;
}
