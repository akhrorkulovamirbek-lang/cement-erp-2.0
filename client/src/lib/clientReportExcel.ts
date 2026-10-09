export type ReportKind = 'opening' | 'sale' | 'payment' | 'goods';

export interface ReportRow {
  kind: ReportKind;
  date: string;
  event: string;
  zavod: string;
  mark: string;
  packaging: string;
  tonnage: number | null;
  price: number | null;
  vehicle: string;
  freight: number | null;
  charged: number | null;
  paid: number | null;
  payer: string;
  method: string;
  comment: string;
  balance: number;
}

const COLUMNS: { header: string; width: number; fmt?: string; align?: 'left' | 'right' | 'center' }[] = [
  { header: 'Дата', width: 12, align: 'center' },
  { header: 'Событие', width: 22 },
  { header: 'Завод', width: 18 },
  { header: 'Марка', width: 14 },
  { header: 'Упаковка', width: 11 },
  { header: 'Тоннаж, т', width: 11, fmt: '#,##0.000', align: 'right' },
  { header: 'Цена за тонну, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Машина', width: 26 },
  { header: 'Доставка за тонну, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Начислено, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Оплачено, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Плательщик', width: 20 },
  { header: 'Способ оплаты', width: 30 },
  { header: 'Комментарий', width: 28 },
  { header: 'Остаток долга, сум', width: 19, fmt: '#,##0;[Red]-#,##0', align: 'right' },
];

const FILL: Record<ReportKind, string> = {
  opening: 'FFEDEDED',
  sale: 'FFFFF4E0',
  payment: 'FFE6F4EA',
  goods: 'FFE3F0FB',
};

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Отчёт по клиенту одним листом: шапка с итогами, затем вся хронология с остатком долга. */
export async function downloadClientReport(params: {
  clientName: string;
  phone: string | null;
  purchased: number;
  paid: number;
  balance: number;
  rows: ReportRow[];
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Отчёт по клиенту', {
    views: [{ state: 'frozen', ySplit: 9 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));
  const lastCol = COLUMNS.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `Отчёт по клиенту: ${params.clientName}`;
  title.font = { bold: true, size: 16, color: { argb: 'FF1F2937' } };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `${params.phone ? params.phone + ' · ' : ''}сформирован ${formatShortDate(new Date().toISOString())}`;
  ws.getCell(2, 1).font = { color: { argb: 'FF6B7280' } };

  const totalTonnage = params.rows.filter((r) => r.kind === 'sale').reduce((s, r) => s + (r.tonnage ?? 0), 0);
  const summary: [string, number, string][] = [
    ['Куплено всего, сум', params.purchased, '#,##0'],
    ['Оплачено всего, сум', params.paid, '#,##0'],
    ['Текущий долг, сум', params.balance, '#,##0;[Red]-#,##0'],
    ['Всего тонн цемента и логистики', totalTonnage, '#,##0.000'],
  ];
  summary.forEach(([label, value, fmt], i) => {
    const r = 4 + i;
    ws.mergeCells(r, 1, r, 3);
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = { bold: true };
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    l.border = border;
    ws.getCell(r, 2).border = border;
    ws.getCell(r, 3).border = border;
    ws.mergeCells(r, 4, r, 5);
    const v = ws.getCell(r, 4);
    v.value = value;
    v.numFmt = fmt;
    v.font = { bold: true, size: 12, color: { argb: i === 2 ? (params.balance > 0 ? 'FFB91C1C' : 'FF15803D') : 'FF111827' } };
    v.alignment = { horizontal: 'right' };
    v.border = border;
    ws.getCell(r, 5).border = border;
  });

  const headerRowNum = 9;
  const header = ws.getRow(headerRowNum);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 34;
  ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: lastCol } };

  params.rows.forEach((r, idx) => {
    const row = ws.getRow(headerRowNum + 1 + idx);
    const values = [
      r.date ? formatShortDate(r.date) : '',
      r.event,
      r.zavod,
      r.mark,
      r.packaging,
      r.tonnage,
      r.price,
      r.vehicle,
      r.freight,
      r.charged,
      r.paid,
      r.payer,
      r.method,
      r.comment,
      r.balance,
    ];
    values.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      const c = COLUMNS[i];
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: i === 7 || i === 12 || i === 13 };
      cell.border = border;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.kind] } };
    });
    row.getCell(2).font = { bold: true };
    row.getCell(10).font = { color: { argb: 'FF9A3412' } };
    row.getCell(11).font = { color: { argb: 'FF15803D' } };
    row.getCell(15).font = { bold: true, color: { argb: r.balance > 0 ? 'FFB91C1C' : 'FF15803D' } };
  });

  const totalRowNum = headerRowNum + 1 + params.rows.length;
  const totalRow = ws.getRow(totalRowNum);
  const charged = params.rows.reduce((s, r) => s + (r.charged ?? 0), 0);
  const paid = params.rows.reduce((s, r) => s + (r.paid ?? 0), 0);
  const totals: Record<number, number | string> = { 1: 'ИТОГО', 6: totalTonnage, 10: charged, 11: paid, 15: params.balance };
  for (let i = 1; i <= lastCol; i++) {
    const cell = totalRow.getCell(i);
    if (totals[i] !== undefined) cell.value = totals[i];
    const c = COLUMNS[i - 1];
    if (c.fmt) cell.numFmt = c.fmt;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle' };
    cell.border = border;
  }

  const legendRow = totalRowNum + 2;
  const legend: [string, ReportKind][] = [
    ['Покупка', 'sale'],
    ['Оплата деньгами', 'payment'],
    ['Оплата товаром', 'goods'],
  ];
  legend.forEach(([label, kind], i) => {
    const cell = ws.getCell(legendRow, 1 + i * 2);
    ws.mergeCells(legendRow, 1 + i * 2, legendRow, 2 + i * 2);
    cell.value = label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[kind] } };
    cell.border = border;
    cell.alignment = { horizontal: 'center' };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Клиент_${params.clientName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
