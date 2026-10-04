import * as XLSX from 'xlsx';

/** Читает .xlsx/.xls/.csv в массив строк по заголовкам первой строки.
 * CSV читается с raw:true — у текстового файла нет настоящих типов ячеек, и без этого SheetJS
 * сам пытается угадать в "Дата" число/дату и превращает "2024-01-10" в серийный номер Excel
 * со сдвигом на часовой пояс браузера (проверено: 45301.208... вместо чистой даты).
 * Для .xlsx/.xls, где ячейки типизированы по-настоящему, даты приводятся к ГГГГ-ММ-ДД через
 * cellDates — UTC-поля совпадают с тем, как SheetJS строит Date из серийного номера Excel. */
export async function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const header = key.trim();
      if (value instanceof Date) {
        out[header] = value.toISOString().slice(0, 10);
      } else {
        out[header] = String(value ?? '').trim();
      }
    }
    return out;
  });
}

/** Скачивает пустой .xlsx с одной строкой заголовков — шаблон для заполнения. */
export function downloadTemplate(filename: string, headers: string[]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Шаблон');
  XLSX.writeFile(workbook, filename);
}
