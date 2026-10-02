import { useMemo, useState } from 'react';
import { ApiError } from '@/api/client';
import { SidePanel } from './SidePanel';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useToast } from '@/lib/toast';

interface ParsedLine {
  raw: string;
  ok: boolean;
  label: string;
  payload?: Record<string, unknown>;
}

/** Раздел 1 ТЗ: удобный ручной ввод стартовых данных списком (без файла-импорта — его нет).
 * По строке на запись, поля разбирает вызывающая страница через parseLine. */
export function BulkImport({
  title,
  hint,
  placeholder,
  parseLine,
  useCreate,
  onClose,
  onDone,
}: {
  title: string;
  hint: string;
  placeholder?: string;
  parseLine: (line: string) => { label: string; payload: Record<string, unknown> } | null;
  useCreate: () => { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const create = useCreate();

  const lines: ParsedLine[] = useMemo(() => {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((raw) => {
        const parsed = parseLine(raw);
        if (!parsed) return { raw, ok: false, label: 'строка не распознана' };
        return { raw, ok: true, label: parsed.label, payload: parsed.payload };
      });
  }, [text, parseLine]);

  const validLines = lines.filter((l) => l.ok);

  async function handleSubmit() {
    if (validLines.length === 0) return;
    setSubmitting(true);
    let created = 0;
    try {
      for (const line of validLines) {
        await create.mutateAsync(line.payload!);
        created++;
      }
      notify(`Добавлено записей: ${created}`);
      setText('');
      onDone();
    } catch (err) {
      notify(
        `${err instanceof ApiError ? err.message : 'Ошибка'} (добавлено ${created} из ${validLines.length})`,
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SidePanel title={title} onClose={onClose} widthClass="sm:max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <Textarea
          autoFocus
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-sm"
        />
        {lines.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <ul className="divide-y text-sm">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{l.raw}</span>
                  <span className={`shrink-0 text-xs ${l.ok ? 'text-emerald-600' : 'text-destructive'}`}>{l.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={validLines.length === 0 || submitting}>
            Добавить{validLines.length > 0 ? ` (${validLines.length})` : ''}
          </Button>
        </div>
      </div>
    </SidePanel>
  );
}
