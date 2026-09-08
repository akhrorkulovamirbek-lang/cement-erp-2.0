import type { ReactNode } from 'react';
import { Input } from './form';

interface FilterBarProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  q?: string;
  onQChange?: (v: string) => void;
  qPlaceholder?: string;
  children?: ReactNode;
}

export function FilterBar({ from, to, onFromChange, onToChange, q, onQChange, qPlaceholder = 'Поиск…', children }: FilterBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="!w-36" />
        <span className="text-xs text-slate-400">—</span>
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="!w-36" />
      </div>
      {onQChange && <Input value={q} onChange={(e) => onQChange(e.target.value)} placeholder={qPlaceholder} className="!w-48" />}
      {children}
      {(from || to || q) && (
        <button
          onClick={() => {
            onFromChange('');
            onToChange('');
            onQChange?.('');
          }}
          className="text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
