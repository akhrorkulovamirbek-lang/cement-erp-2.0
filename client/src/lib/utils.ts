import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Как на бэкенде (machines/routes.ts, sales/service.ts) — для клиентской подсказки
 * своя/наёмная в Логистике до сохранения; сервер всё равно решает сам. */
export function normalizePlateNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}
