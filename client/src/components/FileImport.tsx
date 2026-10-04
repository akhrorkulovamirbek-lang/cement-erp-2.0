import { useRef, useState } from 'react';
import { downloadTemplate, parseSpreadsheet } from '@/lib/fileImport';
import { useToast } from '@/lib/toast';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface ParsedRow {
  index: number;
  ok: boolean;
  label: string;
  payload?: Record<string, unknown>;
}

/** Файловый аналог BulkImport.tsx (раздел «Импорт данных», см. ТЗ): источник — .xlsx/.csv,
 * а не textarea. parseRow разбирает одну строку файла (по заголовкам), onImport отправляет все
 * распознанные строки — либо один запрос на массив (bulk-эндпоинты импорта), либо цикл create
 * (для Клиентов/Заводов, которые переиспользуют обычные эндпоинты создания). */
export function FileImport({
  title,
  hint,
  templateFilename,
  templateHeaders,
  parseRow,
  onImport,
}: {
  title: string;
  hint: string;
  templateFilename: string;
  templateHeaders: string[];
  parseRow: (raw: Record<string, string>) => { label: string; payload: Record<string, unknown> } | null;
  onImport: (payloads: Record<string, unknown>[]) => Promise<number>;
}) {
  const { notify } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.ok);

  async function handleFile(file: File) {
    setFileName(file.name);
    try {
      const rawRows = await parseSpreadsheet(file);
      setRows(
        rawRows.map((raw, index) => {
          const parsed = parseRow(raw);
          if (!parsed) return { index, ok: false, label: 'строка не распознана' };
          return { index, ok: true, label: parsed.label, payload: parsed.payload };
        }),
      );
    } catch {
      notify('Не удалось прочитать файл', 'error');
      setFileName(null);
      setRows([]);
    }
  }

  async function handleSubmit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const count = await onImport(validRows.map((r) => r.payload!));
      notify(`Добавлено записей: ${count}`);
      setFileName(null);
      setRows([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка импорта', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate(templateFilename, templateHeaders)}>
            Скачать шаблон
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
        {fileName && rows.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.index} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{r.ok ? r.label : `Строка ${r.index + 2}`}</span>
                  <span className={`shrink-0 text-xs ${r.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {r.ok ? 'готово' : r.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {fileName && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSubmit} disabled={validRows.length === 0 || submitting}>
              Импортировать{validRows.length > 0 ? ` (${validRows.length})` : ''}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
