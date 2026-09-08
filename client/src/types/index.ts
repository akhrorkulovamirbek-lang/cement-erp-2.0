export interface Zavod {
  id: number;
  name: string;
  created_at: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface CementMark {
  id: number;
  name: string;
  created_at: string;
}

export interface Machine {
  id: number;
  number: string;
  created_at: string;
}

export type CementType = 'рассыпной' | 'мешок';
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
  bought_tonnage: string;
  price_per_ton: string;
  bought_sum: string;
  remaining_tonnage: string;
  remaining_sum: string;
  status: 'active' | 'closed';
  created_at: string;
}

export interface Incoming {
  id: number;
  date: string;
  machine_number: string;
  machine_own: boolean;
  cement_mark_id: number;
  cement_mark_name: string;
  type: CementType;
  tonnage: string;
  price_per_ton: string;
  total_sum: string;
  zavod_id: number;
  zavod_name: string;
  warehouse_received: boolean;
  created_at: string;
}

export interface WarehouseBalance {
  id: number;
  cement_mark_id: number;
  cement_mark_name: string;
  type: CementType;
  tonnage: string;
  avg_cost_per_ton: string;
  updated_at: string;
}

export interface Sale {
  id: number;
  date: string;
  client_id: number;
  client_name: string;
  cement_mark_id: number;
  cement_mark_name: string;
  type: CementType;
  tonnage: string;
  price_per_ton: string;
  total_sum: string;
  currency: Currency;
  usd_rate: string | null;
  source: 'warehouse' | 'ticket';
  ticket_id: number | null;
  ticket_number: string | null;
  cost_per_ton: string;
  cost_total: string;
  margin_total: string;
  has_logistics: boolean;
  machine_number: string | null;
  machine_own: boolean | null;
  logistics_price_per_ton: string | null;
  logistics_total: string | null;
  created_at: string;
}

export interface Logistics {
  id: number;
  date: string;
  machine_number: string;
  machine_own: boolean;
  tonnage: string;
  price_per_ton: string;
  total_sum: string;
  client_id: number | null;
  client_name: string | null;
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
  category: 'цемент' | 'логистика' | 'прочее';
  machine_number: string | null;
  zavod_id: number | null;
  zavod_name: string | null;
  expense_type: string;
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
