import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export function FilterBar({
  from,
  to,
  onFromChange,
  onToChange,
  q,
  onQChange,
  qPlaceholder = 'Поиск…',
  children,
}: FilterBarProps) {
  return (
    <div className="mb-3 grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
      <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="w-full sm:w-40" />
      <span className="hidden text-muted-foreground sm:inline">—</span>
      <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="w-full sm:w-40" />
      {onQChange && (
        <Input
          value={q ?? ''}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={qPlaceholder}
          className="col-span-2 w-full sm:col-span-1 sm:w-52"
        />
      )}
      {children}
      {(from || to || q) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onFromChange('');
            onToChange('');
            onQChange?.('');
          }}
        >
          Сбросить
        </Button>
      )}
    </div>
  );
}
