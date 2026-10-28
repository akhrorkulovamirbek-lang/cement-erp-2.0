export interface ExcelColumn {
  header: string;
  width: number;
  fmt?: string;
  align?: 'left' | 'right' | 'center';
}

type Cell = string | number | null;

/** Скачивает оформленный Excel-лист: заголовок, блок итогов, таблица с закреплённой шапкой,
 * цветные строки и строка «ИТОГО». Общая часть для отчётов (завод, поставщики). */
export async function downloadStyledTable(params: {
  filename: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  summary?: [string, number, string][];
  columns: ExcelColumn[];
  rows: Cell[][];
  /** ARGB-цвет заливки для каждой строки (по индексу), необязательно. */
  rowFills?: (string | undefined)[];
  totals?: Cell[];
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const lastCol = params.columns.length;
  const summaryRows = params.summary?.length ?? 0;
  const headerRowNum = 4 + (summaryRows ? summaryRows + 1 : 0);
  const ws = wb.addWorksheet(params.sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: headerRowNum }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = params.columns.map((c) => ({ width: c.width }));
  const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = params.title;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF1F2937' } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, lastCol);
  const today = new Date();
  const stamp = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  ws.getCell(2, 1).value = `${params.subtitle ? params.subtitle + ' · ' : ''}сформирован ${stamp}`;
  ws.getCell(2, 1).font = { color: { argb: 'FF6B7280' } };

  (params.summary ?? []).forEach(([label, value, fmt], i) => {
    const r = 4 + i;
    ws.mergeCells(r, 1, r, 2);
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = { bold: true };
    l.fill = fill('FFF3F4F6');
    l.border = border;
    ws.getCell(r, 2).border = border;
    const v = ws.getCell(r, 3);
    v.value = value;
    v.numFmt = fmt;
    v.font = { bold: true, size: 12 };
    v.alignment = { horizontal: 'right' };
    v.border = border;
  });

  const header = ws.getRow(headerRowNum);
  params.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill('FF1F3A5F');
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 34;
  ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: lastCol } };

  params.rows.forEach((values, idx) => {
    const row = ws.getRow(headerRowNum + 1 + idx);
    values.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      const c = params.columns[i];
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: true };
      cell.border = border;
      const bg = params.rowFills?.[idx];
      if (bg) cell.fill = fill(bg);
    });
  });

  if (params.totals) {
    const totalRow = ws.getRow(headerRowNum + 1 + params.rows.length);
    params.columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      const v = params.totals![i];
      if (v !== null && v !== undefined) cell.value = v;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill('FF1F3A5F');
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle' };
      cell.border = border;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Понятное сообщение, если не получилось сформировать Excel. Чаще всего причина — страница открыта со времён
 * прошлой версии сайта и не может подгрузить нужный кусок кода: помогает обновление страницы. */
export function excelError(err: unknown): string {
  console.error('Excel export failed:', err);
  const msg = err instanceof Error ? err.message : String(err);
  if (/dynamically imported|Failed to fetch|Importing a module script|ChunkLoadError|Loading chunk/i.test(msg)) {
    return 'Страница устарела после обновления сайта. Обновите её (Ctrl+R) и скачайте заново.';
  }
  return `Не удалось сформировать файл: ${msg.slice(0, 120)}`;
}
