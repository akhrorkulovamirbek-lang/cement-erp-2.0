// Зеркало server/src/core/constants.ts для фронта (фиксированные списки по ТЗ, не справочники в БД).

export const PACKAGING_TYPES = ['MESHOK', 'NAVAL'] as const;
export type PackagingType = (typeof PACKAGING_TYPES)[number];
export const PACKAGING_LABELS: Record<PackagingType, string> = {
  MESHOK: 'Мешок',
  NAVAL: 'Навал',
};
export const PACKAGING_OPTIONS = PACKAGING_TYPES.map((value) => ({ value, label: PACKAGING_LABELS[value] }));

export const WAREHOUSE_TYPES = ['FACT', 'DIRECT', 'TICKET', 'CLIENT_GOODS'] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];
export const WAREHOUSE_LABELS: Record<WarehouseType, string> = {
  FACT: 'Факт',
  DIRECT: 'Напрямую',
  TICKET: 'Тикет',
  CLIENT_GOODS: 'Оплата товаром',
};
export const WAREHOUSE_OPTIONS = WAREHOUSE_TYPES.map((value) => ({ value, label: WAREHOUSE_LABELS[value] }));

export const VEHICLE_TYPES = ['CLIENT', 'OWN', 'HIRED'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  CLIENT: 'Машина клиента',
  OWN: 'Своя машина',
  HIRED: 'Наёмная',
};
export const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((value) => ({ value, label: VEHICLE_TYPE_LABELS[value] }));

export const SALE_TYPES = ['CEMENT', 'LOGISTICS'] as const;
export type SaleType = (typeof SALE_TYPES)[number];
export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  CEMENT: 'Цемент',
  LOGISTICS: 'Логистика',
};
export const SALE_TYPE_OPTIONS = SALE_TYPES.map((value) => ({ value, label: SALE_TYPE_LABELS[value] }));
