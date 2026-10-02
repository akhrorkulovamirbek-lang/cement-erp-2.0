import type { PackagingType, SaleType, VehicleType } from '@/lib/constants';

export interface Zavod {
  id: number;
  name: string;
  region: string | null;
  phone: string | null;
  initial_debt: string;
  active: boolean;
  created_at: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  contact_person: string | null;
  inn: string | null;
  initial_debt: string;
  comment: string | null;
  active: boolean;
  created_at: string;
}

export interface CementMark {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
}

export interface Machine {
  id: number;
  number: string;
  model: string | null;
  driver: string | null;
  capacity_tons: string | null;
  active: boolean;
  created_at: string;
}

export interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
  display_name: string;
  initial_balance: string;
  currency: Currency;
  balance: string;
  active: boolean;
  created_at: string;
}

export interface CashServiceOperation {
  id: number;
  date: string;
  bank_account_id: number;
  bank_account_name: string;
  counterparty_name: string | null;
  counterparty_phone: string | null;
  transfer_amount: string;
  currency: Currency;
  usd_rate: string | null;
  commission_amount: string;
  payout_amount: string;
  related_cash_expense_id: number | null;
  comment: string | null;
  created_at: string;
}

export interface CashServiceSummary {
  commissionTotal: number;
  transferTotal: number;
  count: number;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
}

export const ROLES = ['admin', 'manager', 'operator', 'cashier'] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  operator: 'Оператор',
  cashier: 'Кассир',
};

export interface AppUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const RESOURCE_LABELS: Record<string, string> = {
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

export interface ModuleSetting {
  code: string;
  name: string;
  description: string;
  whenDisabled: string;
  defaultEnabled: boolean;
  enabled: boolean;
}

export interface PermissionRoleRow {
  role: UserRole;
  roleLabel: string;
  resources: { resourceCode: string; resourceLabel: string; allowed: boolean }[];
}

export interface AppSettingsMap {
  session_timeout_minutes?: string;
  broker_allow_negative?: string;
  cash_service_default_commission_percent?: string;
}

export interface AuditLogEntry {
  id: number;
  at: string;
  user_id: number | null;
  user_full_name: string | null;
  user_username: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  object_label: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
}

export type Currency = 'UZS' | 'USD';
export type PaymentType = 'перечисление' | 'наличка' | 'карта';

export interface BrokerAccount {
  id: number;
  balance: string;
  currency: 'UZS';
  updated_at: string;
}

export interface BrokerOperation {
  id: number;
  date: string;
  type: 'replenish' | 'ticket_purchase' | 'ticket_return';
  amount: string;
  description: string | null;
  related_ticket_id: number | null;
  created_at: string;
}

export interface Ticket {
  id: number;
  date: string;
  ticket_number: string;
  zavod_id: number;
  zavod_name: string;
  cement_mark_id: number;
  cement_mark_name: string;
  packaging: PackagingType;
  bought_tonnage: string;
  price_per_ton: string;
  bought_sum: string;
  remaining_tonnage: string;
  remaining_sum: string;
  status: 'active' | 'closed';
  created_at: string;
}

export type IncomingWarehouse = 'FACT' | 'DIRECT' | 'CLIENT_GOODS';

export interface Incoming {
  id: number;
  date: string;
  warehouse: IncomingWarehouse;
  zavod_id: number;
  zavod_name: string;
  cement_mark_id: number;
  cement_mark_name: string;
  packaging: PackagingType;
  tonnage: string;
  price_per_ton: string;
  total_sum: string;
  machine_number: string | null;
  client_id: number | null;
  client_name: string | null;
  comment: string | null;
  linked_sale_id: number | null;
  created_at: string;
}

export interface WarehouseBalance {
  id: number;
  zavod_id: number;
  zavod_name: string;
  cement_mark_id: number;
  cement_mark_name: string;
  packaging: PackagingType;
  tonnage: string;
  avg_cost_per_ton: string;
  updated_at: string;
}

export interface Sale {
  id: number;
  date: string;
  sale_type: SaleType;
  client_id: number;
  client_name: string;
  source: 'warehouse' | 'ticket' | 'direct' | null;
  zavod_id: number | null;
  zavod_name: string | null;
  cement_mark_id: number | null;
  cement_mark_name: string | null;
  packaging: PackagingType | null;
  ticket_id: number | null;
  ticket_number: string | null;
  linked_purchase_id: number | null;
  tonnage: string;
  price_per_ton: string | null;
  cost_per_ton: string;
  cost_total: string;
  margin_total: string;
  vehicle_type: VehicleType;
  own_vehicle_id: number | null;
  own_vehicle_number: string | null;
  machine_number: string | null;
  carrier_name: string | null;
  freight_price_per_ton: string | null;
  hire_price_per_ton: string | null;
  route: string | null;
  total_sum: string;
  comment: string | null;
  created_at: string;
}

export interface CashIncome {
  id: number;
  date: string;
  category: 'цемент' | 'логистика' | 'возврат_биржи' | 'прочее';
  client_id: number | null;
  client_name: string | null;
  amount: string;
  currency: Currency;
  usd_rate: string | null;
  payment_type: PaymentType;
  comment: string | null;
  related_sale_id: number | null;
  created_at: string;
}

export interface CashExpense {
  id: number;
  date: string;
  category: 'цемент' | 'логистика' | 'перевозчик' | 'прочее';
  machine_number: string | null;
  zavod_id: number | null;
  zavod_name: string | null;
  carrier_name: string | null;
  expense_type: string | null;
  amount: string;
  currency: Currency;
  usd_rate: string | null;
  payment_type: PaymentType;
  comment: string | null;
  created_at: string;
}

export interface ClientBalance {
  id: number;
  name: string;
  phone: string | null;
  purchased: string;
  paid: string;
  balance: string;
}

export interface ZavodBalance {
  id: number;
  name: string;
  purchased: string;
  paid: string;
  balance: string;
}

export interface CarrierBalance {
  name: string;
  owed: string;
  paid: string;
  balance: string;
}

export interface DebtsSummary {
  clientDebtTotal: number;
  zavodDebtTotal: number;
  carrierDebtTotal: number;
  topClients: { id: number; name: string; balance: string }[];
  topZavody: { id: number; name: string; balance: string }[];
  topCarriers: { name: string; balance: string }[];
}

export interface CashBalances {
  наличка: number;
  карта: number;
  перечисление: number;
  total: number;
}

export interface CementReportRow {
  zavod_name: string;
  cement_mark_name: string;
  packaging: PackagingType;
  purchased_tonnage: string;
  purchased_sum: string;
  goods_received_tonnage: string;
  goods_received_sum: string;
  sold_tonnage: string;
  sold_sum: string;
  margin_total: string;
}

export interface VehicleReportRow {
  label: string;
  type: 'own' | 'hired';
  trip_count: number;
  revenue: string;
  cost: string;
  margin: string;
}

export interface ReportSummary {
  revenue: number;
  profit: number;
  salesCount: number;
  cashIn: number;
  cashOut: number;
  brokerBalance: number;
  topClients: { id: number; name: string; total: string }[];
  topMarks: { id: number; name: string; tonnage: string }[];
  dailyTrend: { date: string; total: string }[];
  warehouseBalance: WarehouseBalance[];
}
