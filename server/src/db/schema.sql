-- Cement ERP 2.0 schema. Applied idempotently on server startup.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Справочники

CREATE TABLE IF NOT EXISTS zavody (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cement_marks (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Брокерский счёт (биржа), ведётся в UZS

CREATE TABLE IF NOT EXISTS broker_account (
  id SERIAL PRIMARY KEY,
  balance NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UZS',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO broker_account (id, balance, currency)
SELECT 1, 0, 'UZS'
WHERE NOT EXISTS (SELECT 1 FROM broker_account WHERE id = 1);

-- Тикеты (покупки через биржу)

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  ticket_number TEXT NOT NULL,
  zavod_id INTEGER NOT NULL REFERENCES zavody(id),
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  bought_tonnage NUMERIC(12,3) NOT NULL CHECK (bought_tonnage > 0),
  price_per_ton NUMERIC(14,2) NOT NULL CHECK (price_per_ton > 0),
  bought_sum NUMERIC(16,2) NOT NULL,
  remaining_tonnage NUMERIC(12,3) NOT NULL,
  remaining_sum NUMERIC(16,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  -- true only when closed via the explicit "close ticket" action (manual early return of the
  -- unsold balance to the broker account) — as opposed to closing naturally by selling it out.
  -- Sales made from a manually-closed ticket can no longer be edited/deleted (see sales service).
  manually_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_operations (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('replenish', 'ticket_purchase', 'ticket_return')),
  amount NUMERIC(16,2) NOT NULL,
  description TEXT,
  related_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Склад

CREATE TABLE IF NOT EXISTS incoming (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  machine_number TEXT NOT NULL,
  machine_own BOOLEAN NOT NULL DEFAULT true,
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  type TEXT NOT NULL CHECK (type IN ('рассыпной', 'мешок')),
  tonnage NUMERIC(12,3) NOT NULL CHECK (tonnage > 0),
  price_per_ton NUMERIC(14,2) NOT NULL CHECK (price_per_ton > 0),
  total_sum NUMERIC(16,2) NOT NULL,
  zavod_id INTEGER NOT NULL REFERENCES zavody(id),
  warehouse_received BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_balance (
  id SERIAL PRIMARY KEY,
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  type TEXT NOT NULL CHECK (type IN ('рассыпной', 'мешок')),
  tonnage NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost_per_ton NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cement_mark_id, type)
);

-- Продажи

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  type TEXT NOT NULL CHECK (type IN ('рассыпной', 'мешок')),
  tonnage NUMERIC(12,3) NOT NULL CHECK (tonnage > 0),
  price_per_ton NUMERIC(14,2) NOT NULL CHECK (price_per_ton > 0),
  total_sum NUMERIC(16,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  usd_rate NUMERIC(12,2),
  source TEXT NOT NULL CHECK (source IN ('warehouse', 'ticket')),
  ticket_id INTEGER REFERENCES tickets(id),
  cost_per_ton NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  margin_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  has_logistics BOOLEAN NOT NULL DEFAULT false,
  machine_number TEXT,
  machine_own BOOLEAN,
  logistics_price_per_ton NUMERIC(14,2),
  logistics_total NUMERIC(16,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Логистика (самостоятельные услуги перевозки)

CREATE TABLE IF NOT EXISTS logistics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  machine_number TEXT NOT NULL,
  machine_own BOOLEAN NOT NULL DEFAULT true,
  tonnage NUMERIC(12,3) NOT NULL CHECK (tonnage > 0),
  price_per_ton NUMERIC(14,2) NOT NULL CHECK (price_per_ton > 0),
  total_sum NUMERIC(16,2) NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Касса

CREATE TABLE IF NOT EXISTS cash_income (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('цемент', 'логистика', 'возврат_биржи', 'прочее')),
  client_id INTEGER REFERENCES clients(id),
  amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  usd_rate NUMERIC(12,2),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('перечисление', 'наличка', 'карта')),
  comment TEXT,
  related_sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  related_broker_op_id INTEGER REFERENCES broker_operations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_expense (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('цемент', 'логистика', 'прочее')),
  machine_number TEXT,
  zavod_id INTEGER REFERENCES zavody(id),
  expense_type TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  usd_rate NUMERIC(12,2),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('перечисление', 'наличка', 'карта')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_incoming_zavod ON incoming(zavod_id);
CREATE INDEX IF NOT EXISTS idx_incoming_date ON incoming(date);
CREATE INDEX IF NOT EXISTS idx_tickets_zavod ON tickets(zavod_id);
CREATE INDEX IF NOT EXISTS idx_cash_income_client ON cash_income(client_id);
CREATE INDEX IF NOT EXISTS idx_cash_expense_zavod ON cash_expense(zavod_id);
CREATE INDEX IF NOT EXISTS idx_logistics_client ON logistics(client_id);
