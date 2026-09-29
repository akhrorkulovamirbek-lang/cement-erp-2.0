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
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="w-40" />
      <span className="text-muted-foreground">—</span>
      <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="w-40" />
      {onQChange && (
        <Input
          value={q ?? ''}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={qPlaceholder}
          className="w-52"
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
