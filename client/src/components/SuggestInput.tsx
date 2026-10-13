import { useId } from 'react';
import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/** Текстовое поле с выпадающим списком подсказок (то, что уже вводили раньше) — можно выбрать
 * из списка или напечатать новое значение. Нативный datalist: работает и в форме на react-hook-form. */
export function SuggestInput({ options, ...props }: ComponentProps<typeof Input> & { options: string[] }) {
  const id = useId();
  return (
    <>
      <Input {...props} list={id} autoComplete="off" />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
