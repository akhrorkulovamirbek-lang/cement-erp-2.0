// Фиксированные справочники по ТЗ — не редактируются пользователем, поэтому не таблицы БД.

export const ROLES = ['admin', 'manager', 'operator', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  operator: 'Оператор',
  cashier: 'Кассир',
};

// Ресурсы, на которые выдаются права (roles x resource -> allowed).
// 'sales' покрывает и Логистику — она теперь тип продажи внутри единой формы (раздел 3 ТЗ),
// не отдельный раздел. 'incoming' покрывает и покупку тикетов (раздел 2 ТЗ: выбор «Тикет» в
// Приходе — это форма «Покупка тикета», один документ) — см. requireAnyPermission в app.ts.
export const RESOURCE_CODES = [
  'references',
  'incoming',
  'sales',
  'cash',
  'broker',
  'reports',
  'users',
  'settings',
  'auditLog',
] as const;
export type ResourceCode = (typeof RESOURCE_CODES)[number];

export const RESOURCE_LABELS: Record<ResourceCode, string> = {
  references: 'Справочники',
  incoming: 'Приход',
  sales: 'Продажа',
  cash: 'Касса',
  broker: 'Брокерский счёт',
  reports: 'Отчёты',
  users: 'Пользователи',
  settings: 'Настройки',
  auditLog: 'Журнал действий',
};

/** Раздел 8.2.3 ТЗ. Редактируется администратором в Настройках, это лишь дефолт для сидирования. */
export const DEFAULT_PERMISSIONS: Record<Role, ResourceCode[]> = {
  admin: [...RESOURCE_CODES],
  manager: RESOURCE_CODES.filter((r) => r !== 'users' && r !== 'settings') as ResourceCode[],
  operator: ['references', 'incoming', 'sales'],
  cashier: ['references', 'cash', 'broker', 'reports'],
};

export const PACKAGING_TYPES = ['MESHOK', 'NAVAL'] as const;
export type PackagingType = (typeof PACKAGING_TYPES)[number];
export const PACKAGING_LABELS: Record<PackagingType, string> = {
  MESHOK: 'Мешок',
  NAVAL: 'Навал',
};

export const WAREHOUSE_TYPES = ['FACT', 'DIRECT', 'TICKET'] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];
export const WAREHOUSE_LABELS: Record<WarehouseType, string> = {
  FACT: 'Факт',
  DIRECT: 'Напрямую',
  TICKET: 'Тикеты',
};

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  TRANSFER: 'Перевод',
};

export const CURRENCIES = ['UZS', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
