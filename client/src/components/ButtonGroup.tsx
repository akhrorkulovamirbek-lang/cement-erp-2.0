import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { cn } from '@/lib/utils';

export interface ButtonGroupOption {
  value: string;
  label: string;
}

/** Раздел 10 ТЗ: выбор из 2–4 вариантов — кнопками, а не выпадающим списком. */
export function ButtonGroup({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ButtonGroupOption[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'min-h-11 rounded-md border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === o.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-foreground hover:bg-accent',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RHFButtonGroup<T extends FieldValues>({
  control,
  name,
  options,
  disabled,
  className,
}: {
  control: Control<T>;
  name: Path<T>;
  options: ButtonGroupOption[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ButtonGroup
          value={String(field.value ?? '')}
          onChange={field.onChange}
          options={options}
          disabled={disabled}
          className={className}
        />
      )}
    />
  );
}
