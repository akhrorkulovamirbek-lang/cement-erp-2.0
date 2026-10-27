import ExcelJS from 'exceljs';
import { pool } from '../../db/pool.js';
import { UZS_EXPENSE, UZS_INCOME } from '../reports/routes.js';

/** Excel-выписка для клиента: вся хронология одним листом с остатком долга после каждой операции.
 * В отличие от внутреннего отчёта на сайте здесь нет поставщиков, закупочных цен, маржи и комментариев. */

type Kind = 'opening' | 'sale' | 'payment' | 'goods' | 'adjustment';

interface Event {
  kind: Kind;
  date: string;
  order: number;
  event: string;
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
}

const PACKAGING: Record<string, string> = { MESHOK: 'Мешок', NAVAL: 'Навал' };
const VEHICLE: Record<string, string> = { CLIENT: 'машина клиента', OWN: 'наша машина', HIRED: 'наёмная машина' };

const blank = (): Omit<Event, 'kind' | 'date' | 'order' | 'event'> => ({
  mark: '',
  packaging: '',
  tonnage: null,
  price: null,
  vehicle: '',
  freight: null,
  charged: null,
  paid: null,
  payer: '',
  method: '',
});

async function loadEvents(clientId: number): Promise<{ initial: number; events: Event[] }> {
  const [client, sales, income, goods, adj, expense] = await Promise.all([
    pool.query('SELECT initial_debt FROM clients WHERE id = $1', [clientId]),
    pool.query(
      `SELECT s.id, s.date, s.sale_type, cm.name AS mark, s.packaging, s.tonnage, s.price_per_ton, s.freight_price_per_ton,
              s.vehicle_type, COALESCE(ov.number, s.machine_number) AS machine, s.total_sum
       FROM sales s LEFT JOIN cement_marks cm ON cm.id = s.cement_mark_id LEFT JOIN machines ov ON ov.id = s.own_vehicle_id
       WHERE s.client_id = $1`,
      [clientId],
    ),
    pool.query(`SELECT id, date, (${UZS_INCOME}) AS uzs, payment_type, payer_name, currency, amount, usd_rate FROM cash_income WHERE client_id = $1`, [clientId]),
    pool.query(
      `SELECT i.id, i.date, i.tonnage, i.price_per_ton, i.total_sum, cm.name AS mark, i.packaging
       FROM incoming i LEFT JOIN cement_marks cm ON cm.id = i.cement_mark_id WHERE i.warehouse = 'CLIENT_GOODS' AND i.client_id = $1`,
      [clientId],
    ),
    pool.query('SELECT id, date, amount FROM client_debt_adjustments WHERE client_id = $1', [clientId]),
    pool.query(`SELECT id, date, (${UZS_EXPENSE}) AS uzs FROM cash_expense WHERE client_id = $1 AND category = 'контрагент'`, [clientId]),
  ]);

  const events: Event[] = [];
  for (const r of sales.rows) {
    const freight = r.vehicle_type !== 'CLIENT' && Number(r.freight_price_per_ton) > 0 ? Number(r.freight_price_per_ton) : null;
    const isCement = r.sale_type === 'CEMENT';
    events.push({
      ...blank(),
      kind: 'sale',
      date: r.date,
      order: 1,
      event: isCement ? 'Покупка цемента' : 'Перевозка',
      mark: r.mark ?? '',
      packaging: r.packaging ? (PACKAGING[r.packaging] ?? r.packaging) : '',
      tonnage: Number(r.tonnage),
      price: isCement ? Number(r.price_per_ton) : Number(r.freight_price_per_ton),
      vehicle: [r.machine, VEHICLE[r.vehicle_type]].filter(Boolean).join(', '),
      freight: isCement ? freight : null,
      charged: Number(r.total_sum),
    });
  }
  for (const r of income.rows) {
    events.push({
      ...blank(),
      kind: 'payment',
      date: r.date,
      order: 2,
      event: 'Оплата',
      paid: Number(r.uzs),
      payer: r.payer_name ?? '',
      method: r.currency === 'USD' ? `${r.payment_type}, $${Math.round(Number(r.amount))} по курсу ${Math.round(Number(r.usd_rate))}` : r.payment_type,
    });
  }
  for (const r of goods.rows) {
    events.push({
      ...blank(),
      kind: 'goods',
      date: r.date,
      order: 2,
      event: 'Оплата цементом',
      mark: r.mark ?? '',
      packaging: r.packaging ? (PACKAGING[r.packaging] ?? r.packaging) : '',
      tonnage: Number(r.tonnage),
      price: Number(r.price_per_ton),
      paid: Number(r.total_sum),
    });
  }
  for (const r of adj.rows) {
    const amount = Number(r.amount);
    events.push({ ...blank(), kind: 'adjustment', date: r.date, order: 3, event: 'Корректировка долга', ...(amount > 0 ? { charged: amount } : { paid: -amount }) });
  }
  for (const r of expense.rows) {
    events.push({ ...blank(), kind: 'payment', date: r.date, order: 2, event: 'Мы выплатили вам', paid: -Number(r.uzs), method: 'деньги' });
  }
  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
  return { initial: Number(client.rows[0]?.initial_debt ?? 0), events };
}

const COLUMNS: { header: string; width: number; fmt?: string; align?: 'left' | 'right' | 'center' }[] = [
  { header: 'Дата', width: 12, align: 'center' },
  { header: 'Событие', width: 22 },
  { header: 'Марка', width: 14 },
  { header: 'Упаковка', width: 11 },
  { header: 'Тоннаж, т', width: 11, fmt: '#,##0.000', align: 'right' },
  { header: 'Цена за тонну, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Машина', width: 28 },
  { header: 'Доставка за тонну, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Начислено, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Оплачено, сум', width: 17, fmt: '#,##0', align: 'right' },
  { header: 'Плательщик', width: 20 },
  { header: 'Способ оплаты', width: 26 },
  { header: 'Остаток долга, сум', width: 19, fmt: '#,##0;[Red]-#,##0', align: 'right' },
];

const FILL: Record<Kind, string> = {
  opening: 'FFEDEDED',
  sale: 'FFFFF4E0',
  payment: 'FFE6F4EA',
  goods: 'FFE3F0FB',
  adjustment: 'FFF3E8FF',
};

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export async function buildClientWorkbook(
  clientId: number,
  clientName: string,
  range: { from: string | null; to: string | null; label: string },
): Promise<{ file: Buffer; purchased: number; paid: number; debt: number }> {
  const { initial, events: all } = await loadEvents(clientId);
  const delta = (e: Event) => (e.charged ?? 0) - (e.paid ?? 0);

  // Всё, что было до начала периода, сворачиваем в одну строку «Остаток на начало».
  const before = range.from ? all.filter((e) => e.date < range.from!) : [];
  const inPeriod = all.filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to));
  const opening = initial + before.reduce((s, e) => s + delta(e), 0);

  const rows: (Event & { balance: number })[] = [];
  let balance = opening;
  if (Math.abs(opening) > 0.5) {
    rows.push({
      ...blank(),
      kind: 'opening',
      date: range.from ?? '',
      order: 0,
      event: range.from ? 'Остаток на начало периода' : 'Начальный долг',
      balance,
    });
  }
  for (const e of inPeriod) {
    balance += delta(e);
    rows.push({ ...e, balance });
  }

  const purchased = inPeriod.reduce((s, e) => s + (e.charged ?? 0), 0);
  const paid = inPeriod.reduce((s, e) => s + (e.paid ?? 0), 0);
  const tonnage = inPeriod.filter((e) => e.kind === 'sale').reduce((s, e) => s + (e.tonnage ?? 0), 0);
  // Текущий долг считаем по всем операциям, а не только по периоду.
  const currentDebt = initial + all.reduce((s, e) => s + delta(e), 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Выписка', {
    views: [{ state: 'frozen', ySplit: 9 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));
  const lastCol = COLUMNS.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `Выписка по клиенту: ${clientName}`;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF1F2937' } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, lastCol);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  ws.getCell(2, 1).value = `Период: ${range.label} · сформирована ${dmy(today)}`;
  ws.getCell(2, 1).font = { color: { argb: 'FF6B7280' } };

  const summary: [string, number, string][] = [
    ['Куплено за период, сум', purchased, '#,##0'],
    ['Оплачено за период, сум', paid, '#,##0'],
    ['Текущий долг, сум', currentDebt, '#,##0;[Red]-#,##0'],
    ['Тонн за период', tonnage, '#,##0.000'],
  ];
  summary.forEach(([label, value, fmt], i) => {
    const r = 4 + i;
    ws.mergeCells(r, 1, r, 3);
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = { bold: true };
    l.fill = fill('FFF3F4F6');
    l.border = border;
    ws.getCell(r, 2).border = border;
    ws.getCell(r, 3).border = border;
    ws.mergeCells(r, 4, r, 5);
    const v = ws.getCell(r, 4);
    v.value = value;
    v.numFmt = fmt;
    v.font = { bold: true, size: 12, color: { argb: i === 2 ? (currentDebt > 0 ? 'FFB91C1C' : 'FF15803D') : 'FF111827' } };
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
    cell.fill = fill('FF1F3A5F');
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 34;
  ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: lastCol } };

  rows.forEach((r, idx) => {
    const row = ws.getRow(headerRowNum + 1 + idx);
    const values = [r.date ? dmy(r.date) : '', r.event, r.mark, r.packaging, r.tonnage, r.price, r.vehicle, r.freight, r.charged, r.paid, r.payer, r.method, r.balance];
    values.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      const c = COLUMNS[i];
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: i === 6 || i === 11 };
      cell.border = border;
      cell.fill = fill(FILL[r.kind]);
    });
    row.getCell(2).font = { bold: true };
    row.getCell(9).font = { color: { argb: 'FF9A3412' } };
    row.getCell(10).font = { color: { argb: 'FF15803D' } };
    row.getCell(13).font = { bold: true, color: { argb: r.balance > 0 ? 'FFB91C1C' : 'FF15803D' } };
  });

  const totalRow = ws.getRow(headerRowNum + 1 + rows.length);
  const totals: Record<number, number | string> = { 1: 'ИТОГО', 5: tonnage, 9: purchased, 10: paid, 13: balance };
  for (let i = 1; i <= lastCol; i++) {
    const cell = totalRow.getCell(i);
    if (totals[i] !== undefined) cell.value = totals[i];
    const c = COLUMNS[i - 1];
    if (c.fmt) cell.numFmt = c.fmt;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill('FF1F3A5F');
    cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle' };
    cell.border = border;
  }

  const legendRow = headerRowNum + rows.length + 3;
  (
    [
      ['Покупка', 'sale'],
      ['Оплата деньгами', 'payment'],
      ['Оплата цементом', 'goods'],
      ['Корректировка', 'adjustment'],
    ] as [string, Kind][]
  ).forEach(([label, kind], i) => {
    ws.mergeCells(legendRow, 1 + i * 2, legendRow, 2 + i * 2);
    const cell = ws.getCell(legendRow, 1 + i * 2);
    cell.value = label;
    cell.fill = fill(FILL[kind]);
    cell.border = border;
    cell.alignment = { horizontal: 'center' };
  });

  return { file: Buffer.from(await wb.xlsx.writeBuffer()), purchased, paid, debt: currentDebt };
}
