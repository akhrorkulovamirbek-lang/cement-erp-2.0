-- Cement ERP 2.0 schema. Applied idempotently on server startup.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'operator', 'cashier')),
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Справочники

CREATE TABLE IF NOT EXISTS zavody (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  region TEXT,
  phone TEXT,
  initial_debt NUMERIC(16,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE zavody ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE zavody ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE zavody ADD COLUMN IF NOT EXISTS initial_debt NUMERIC(16,2) NOT NULL DEFAULT 0;
ALTER TABLE zavody ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  phone TEXT,
  contact_person TEXT,
  inn TEXT,
  initial_debt NUMERIC(16,2) NOT NULL DEFAULT 0,
  comment TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS inn TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS initial_debt NUMERIC(16,2) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS cement_marks (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cement_marks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- "Свои машины"
CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  model TEXT,
  driver TEXT,
  capacity_tons NUMERIC(8,3),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS driver TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS capacity_tons NUMERIC(8,3);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Категории расходов логистики (админ может добавлять). Перевозчики намеренно не справочник —
-- см. sales.carrier_name: это просто текст, живёт, пока есть долг, не хранится как контрагент.
CREATE TABLE IF NOT EXISTS logistics_expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Банковские счета — используются модулем «Обналичивание» (см. cash_service_operations ниже).
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  display_name TEXT UNIQUE NOT NULL,
  initial_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  -- Текущий баланс — ведётся транзакционно (см. cashService/service.ts), не редактируется напрямую.
  balance NUMERIC(16,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UZS';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(16,2);
UPDATE bank_accounts SET balance = initial_balance WHERE balance IS NULL;
ALTER TABLE bank_accounts ALTER COLUMN balance SET NOT NULL;
ALTER TABLE bank_accounts ALTER COLUMN balance SET DEFAULT 0;

-- bankAccountsRouter (createRefRouter) не включает balance в список колонок INSERT — счёт
-- всегда должен стартовать с balance = initial_balance, независимо от того, кто создаёт запись.
CREATE OR REPLACE FUNCTION bank_accounts_init_balance() RETURNS trigger AS $$
BEGIN
  NEW.balance := NEW.initial_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bank_accounts_set_initial_balance ON bank_accounts;
CREATE TRIGGER bank_accounts_set_initial_balance BEFORE INSERT ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION bank_accounts_init_balance();

-- Ядро: права, настройки, журнал действий

CREATE TABLE IF NOT EXISTS permissions (
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator', 'cashier')),
  resource_code TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (role, resource_code)
);

CREATE TABLE IF NOT EXISTS module_settings (
  code TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  object_label TEXT,
  before JSONB,
  after JSONB,
  ip TEXT,
  user_agent TEXT
);

-- Журнал нельзя изменить или удалить, даже админом (раздел 8.4 ТЗ).
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Регистры (раздел 9.5 ТЗ) — инфраструктура для Фазы 2/3, документы ещё не пишут сюда.

CREATE TABLE IF NOT EXISTS stock_movement (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  warehouse TEXT NOT NULL CHECK (warehouse IN ('FACT', 'DIRECT', 'TICKET')),
  zavod_id INTEGER REFERENCES zavody(id),
  cement_mark_id INTEGER REFERENCES cement_marks(id),
  packaging TEXT CHECK (packaging IN ('MESHOK', 'NAVAL')),
  ticket_id INTEGER,
  tons NUMERIC(12,3) NOT NULL,
  cost_per_ton NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_movement (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('CLIENT', 'ZAVOD', 'CARRIER')),
  -- CLIENT/ZAVOD пишут counterparty_id (FK по смыслу, без constraint — тип общий на оба);
  -- CARRIER — не справочник (см. sales.carrier_name), пишет counterparty_name.
  counterparty_id INTEGER,
  counterparty_name TEXT,
  contour TEXT NOT NULL CHECK (contour IN ('TRADE', 'CASH_SERVICE')),
  amount NUMERIC(16,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS money_movement (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  account TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
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
  packaging TEXT NOT NULL DEFAULT 'MESHOK' CHECK (packaging IN ('MESHOK', 'NAVAL')),
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
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS packaging TEXT NOT NULL DEFAULT 'MESHOK' CHECK (packaging IN ('MESHOK', 'NAVAL'));

CREATE TABLE IF NOT EXISTS broker_operations (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('replenish', 'ticket_purchase', 'ticket_return')),
  amount NUMERIC(16,2) NOT NULL,
  description TEXT,
  related_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Склад. warehouse: FACT (обычный приход) / DIRECT (напрямую клиенту, склад не меняется,
-- см. linked_sale_id — при DIRECT создаётся и связывается со строкой sales одной транзакцией) /
-- CLIENT_GOODS (раздел 9.2 ТЗ «Оплата товаром» — клиент гасит долг цементом вместо денег;
-- механически как FACT (тот же склад/себестоимость), но привязан к client_id и уменьшает долг
-- клиента, не завода — см. UZS_INCOME-подобный union в reports/routes.ts и исключение из
-- zavod-balance).

CREATE TABLE IF NOT EXISTS incoming (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  warehouse TEXT NOT NULL DEFAULT 'FACT' CHECK (warehouse IN ('FACT', 'DIRECT', 'CLIENT_GOODS')),
  zavod_id INTEGER NOT NULL REFERENCES zavody(id),
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  packaging TEXT NOT NULL CHECK (packaging IN ('MESHOK', 'NAVAL')),
  tonnage NUMERIC(12,3) NOT NULL CHECK (tonnage > 0),
  price_per_ton NUMERIC(14,2) NOT NULL CHECK (price_per_ton > 0),
  total_sum NUMERIC(16,2) NOT NULL,
  machine_number TEXT,
  comment TEXT,
  linked_sale_id INTEGER,
  -- Только для warehouse='CLIENT_GOODS' — кто отдал нам этот цемент в счёт своего долга.
  client_id INTEGER REFERENCES clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incoming DROP CONSTRAINT IF EXISTS incoming_warehouse_check;
ALTER TABLE incoming ADD CONSTRAINT incoming_warehouse_check CHECK (warehouse IN ('FACT', 'DIRECT', 'CLIENT_GOODS'));
ALTER TABLE incoming ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);

-- Остаток «Факт» — по ключу завод + марка + упаковка (раздел 5 ТЗ).
CREATE TABLE IF NOT EXISTS warehouse_balance (
  id SERIAL PRIMARY KEY,
  zavod_id INTEGER NOT NULL REFERENCES zavody(id),
  cement_mark_id INTEGER NOT NULL REFERENCES cement_marks(id),
  packaging TEXT NOT NULL CHECK (packaging IN ('MESHOK', 'NAVAL')),
  tonnage NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost_per_ton NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (zavod_id, cement_mark_id, packaging)
);

-- Продажи: единая форма Цемент/Логистика (раздел 3 ТЗ). vehicle_type — тип машины у рейса
-- (общий для обеих веток и для Напрямую-приходов): CLIENT (клиент сам забирает, доставки нет),
-- OWN (своя машина, own_vehicle_id), HIRED (наёмная — carrier_name текстом, не справочник:
-- см. решение пользователя не заводить «Перевозчиков» как отдельную сущность).
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sale_type TEXT NOT NULL DEFAULT 'CEMENT' CHECK (sale_type IN ('CEMENT', 'LOGISTICS')),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  source TEXT CHECK (source IN ('warehouse', 'ticket', 'direct')),
  zavod_id INTEGER REFERENCES zavody(id),
  cement_mark_id INTEGER REFERENCES cement_marks(id),
  packaging TEXT CHECK (packaging IN ('MESHOK', 'NAVAL')),
  ticket_id INTEGER REFERENCES tickets(id),
  linked_purchase_id INTEGER REFERENCES incoming(id),
  tonnage NUMERIC(12,3) NOT NULL CHECK (tonnage > 0),
  price_per_ton NUMERIC(14,2),
  cost_per_ton NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  margin_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('CLIENT', 'OWN', 'HIRED')),
  own_vehicle_id INTEGER REFERENCES machines(id),
  machine_number TEXT,
  carrier_name TEXT,
  freight_price_per_ton NUMERIC(14,2),
  hire_price_per_ton NUMERIC(14,2),
  route TEXT,
  total_sum NUMERIC(16,2) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE incoming ADD CONSTRAINT incoming_linked_sale_fk FOREIGN KEY (linked_sale_id) REFERENCES sales(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  category TEXT NOT NULL CHECK (category IN ('цемент', 'логистика', 'перевозчик', 'прочее')),
  machine_number TEXT,
  zavod_id INTEGER REFERENCES zavody(id),
  -- Перевозчик — не справочник (см. sales.carrier_name), просто текст.
  carrier_name TEXT,
  -- expense_type необязателен для category='перевозчик' (там роль типа расхода играет carrier_name).
  expense_type TEXT,
  amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  usd_rate NUMERIC(12,2),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('перечисление', 'наличка', 'карта')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cash_expense ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE cash_expense ALTER COLUMN expense_type DROP NOT NULL;
ALTER TABLE cash_expense DROP CONSTRAINT IF EXISTS cash_expense_category_check;
ALTER TABLE cash_expense ADD CONSTRAINT cash_expense_category_check CHECK (category IN ('цемент', 'логистика', 'перевозчик', 'прочее', 'обналичивание'));

-- Обналичивание: приём перевода на банковский счёт, выдача наличных за вычетом комиссии.
-- Выдача отражается связанной строкой cash_expense (category='обналичивание') — см.
-- cashService/service.ts; эта строка редактируется/удаляется только со стороны Обналичивания
-- (см. 409-guard в cash/routes.ts), как и sales.source='direct' редактируется только из Прихода.
CREATE TABLE IF NOT EXISTS cash_service_operations (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  -- Контрагент — не справочник, просто текст (та же логика, что и sales.carrier_name).
  counterparty_name TEXT,
  counterparty_phone TEXT,
  transfer_amount NUMERIC(16,2) NOT NULL CHECK (transfer_amount > 0),
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  usd_rate NUMERIC(12,2),
  commission_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  payout_amount NUMERIC(16,2) NOT NULL,
  related_cash_expense_id INTEGER REFERENCES cash_expense(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_service_bank_account ON cash_service_operations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_service_date ON cash_service_operations(date);

CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_incoming_zavod ON incoming(zavod_id);
CREATE INDEX IF NOT EXISTS idx_incoming_date ON incoming(date);
CREATE INDEX IF NOT EXISTS idx_tickets_zavod ON tickets(zavod_id);
CREATE INDEX IF NOT EXISTS idx_cash_income_client ON cash_income(client_id);
CREATE INDEX IF NOT EXISTS idx_cash_expense_zavod ON cash_expense(zavod_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_object ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_stock_movement_key ON stock_movement(warehouse, zavod_id, cement_mark_id, packaging);
CREATE INDEX IF NOT EXISTS idx_stock_movement_ticket ON stock_movement(ticket_id);
CREATE INDEX IF NOT EXISTS idx_stock_movement_document ON stock_movement(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_settlement_movement_counterparty ON settlement_movement(counterparty_type, counterparty_id, contour);
CREATE INDEX IF NOT EXISTS idx_settlement_movement_document ON settlement_movement(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_money_movement_account ON money_movement(account);
CREATE INDEX IF NOT EXISTS idx_money_movement_document ON money_movement(document_type, document_id);
