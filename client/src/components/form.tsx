import type { ReactNode } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export { Input } from '@/components/ui/input';

export function FormRow({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

const ALL_SENTINEL = '__all__';

/** Uncontrolled-of-RHF shadcn Select for filters etc. An option with value "" is allowed
 * (rendered via an internal sentinel, since Radix forbids empty-string item values). */
export function PlainSelect({
  value,
  onValueChange,
  options,
  placeholder = '—',
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <UiSelect value={value === '' ? ALL_SENTINEL : value} onValueChange={(v) => onValueChange(v === ALL_SENTINEL ? '' : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || ALL_SENTINEL} value={o.value === '' ? ALL_SENTINEL : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  );
}

export function RHFSelect<T extends FieldValues>({
  control,
  name,
  options,
  placeholder = '—',
  disabled,
  className,
}: {
  control: Control<T>;
  name: Path<T>;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <UiSelect value={field.value ? String(field.value) : ''} onValueChange={field.onChange} disabled={disabled}>
          <SelectTrigger className={className ?? 'w-full'}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      )}
    />
  );
}

export function RHFCheckbox<T extends FieldValues>({
  control,
  name,
  label,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex items-center gap-2 text-sm">
          <UiCheckbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
          {label}
        </label>
      )}
    />
  );
}
