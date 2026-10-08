import Database from 'better-sqlite3';

export type DB = Database.Database;

/** Append-only list. Each entry runs once, in order; PRAGMA user_version tracks progress. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','STOCK_CLERK')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    national_id TEXT,
    address TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_customers_name ON customers(name);
  CREATE INDEX idx_customers_phone ON customers(phone);
  -- Rate history is append-only: every transaction snapshots the rate it used.
  CREATE TABLE gold_rates (
    id INTEGER PRIMARY KEY,
    -- All rates are per gram of PURE gold, minor units. Two product classes, as the association publishes:
    buy_per_gram INTEGER NOT NULL CHECK (buy_per_gram > 0),            -- ornament (รูปพรรณ)
    sell_per_gram INTEGER NOT NULL CHECK (sell_per_gram >= buy_per_gram),
    bar_buy_per_gram INTEGER NOT NULL CHECK (bar_buy_per_gram > 0),    -- bar (ทองคำแท่ง)
    bar_sell_per_gram INTEGER NOT NULL CHECK (bar_sell_per_gram >= bar_buy_per_gram),
    source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','ASSOCIATION')),
    announcement_no TEXT,                                              -- association announcement number
    note TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    effective_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  -- One row per physical piece (or lot).
  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'ORNAMENT',
    weight_mg INTEGER NOT NULL CHECK (weight_mg > 0),
    purity_bp INTEGER NOT NULL CHECK (purity_bp > 0 AND purity_bp <= 10000),
    making_type TEXT NOT NULL CHECK (making_type IN ('FIXED','PER_GRAM','PERCENT')),
    making_value INTEGER NOT NULL CHECK (making_value >= 0),
    other_charge INTEGER NOT NULL DEFAULT 0 CHECK (other_charge >= 0),
    cost INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK','SOLD','RESERVED','MISSING','VOIDED')),
    source TEXT NOT NULL DEFAULT 'NEW' CHECK (source IN ('NEW','TRADE_IN','FORFEITED')),
    location TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_items_status ON items(status);
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    doc_no TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('SALE','TRADE_IN','BUYBACK')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','VOIDED')),
    customer_id INTEGER REFERENCES customers(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    rate_id INTEGER NOT NULL REFERENCES gold_rates(id),
    rate_sell_per_gram INTEGER NOT NULL,
    rate_buy_per_gram INTEGER NOT NULL,
    rate_bar_sell_per_gram INTEGER NOT NULL,
    rate_bar_buy_per_gram INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    gold_total INTEGER NOT NULL,
    making_total INTEGER NOT NULL,
    other_total INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL,
    tax INTEGER NOT NULL,
    sale_total INTEGER NOT NULL,
    trade_in_credit INTEGER NOT NULL,
    net INTEGER NOT NULL,                 -- >0 customer pays, <0 shop pays
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    voided_at TEXT,
    voided_by INTEGER REFERENCES users(id),
    void_reason TEXT
  );
  CREATE INDEX idx_tx_created ON transactions(created_at);
  CREATE TABLE transaction_lines (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    kind TEXT NOT NULL CHECK (kind IN ('SALE','TRADE_IN')),
    item_id INTEGER REFERENCES items(id),
    description TEXT NOT NULL,
    weight_mg INTEGER NOT NULL,
    purity_bp INTEGER NOT NULL,
    gold_value INTEGER NOT NULL,
    making INTEGER NOT NULL DEFAULT 0,
    other INTEGER NOT NULL DEFAULT 0,
    deduction INTEGER NOT NULL DEFAULT 0,
    cost INTEGER NOT NULL DEFAULT 0,      -- item cost snapshot at sale → profit reporting
    line_total INTEGER NOT NULL
  );
  CREATE INDEX idx_lines_tx ON transaction_lines(transaction_id);
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    method TEXT NOT NULL CHECK (method IN ('CASH','CARD','TRANSFER','SAVINGS','OTHER')),
    amount INTEGER NOT NULL,              -- signed: + received, - paid out
    reference TEXT
  );
  CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    weight_mg INTEGER NOT NULL,
    transaction_id INTEGER REFERENCES transactions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_mov_item ON stock_movements(item_id);
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE doc_sequences (day TEXT PRIMARY KEY, last INTEGER NOT NULL);
  INSERT INTO settings(key,value) VALUES
    ('shop_name','Sola Gold'),
    ('tax_rate_bp','700'),
    ('tax_mode','MAKING_ONLY');
  `,
  // ---- 2: pawn / consignment, savings, loyalty, tax documents, ledger
  `
  -- Membership + Thai ID-card-reader fields on customers
  ALTER TABLE customers ADD COLUMN member_no TEXT;
  ALTER TABLE customers ADD COLUMN title TEXT;
  ALTER TABLE customers ADD COLUMN name_en TEXT;
  ALTER TABLE customers ADD COLUMN birth_date TEXT;
  ALTER TABLE customers ADD COLUMN id_card_issue_date TEXT;
  ALTER TABLE customers ADD COLUMN id_card_expiry_date TEXT;
  ALTER TABLE customers ADD COLUMN id_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (id_source IN ('MANUAL','CARD_READER'));
  ALTER TABLE customers ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX idx_customers_member_no ON customers(member_no) WHERE member_no IS NOT NULL;
  CREATE UNIQUE INDEX idx_customers_national_id ON customers(national_id) WHERE national_id IS NOT NULL;

  -- ขายฝาก (SELL_BACK) and จำนำ (PAWN) contracts. Simple interest, monthly rate in basis points.
  CREATE TABLE pawn_contracts (
    id INTEGER PRIMARY KEY,
    contract_no TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('PAWN','SELL_BACK')),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    principal INTEGER NOT NULL CHECK (principal > 0),
    rate_bp_per_month INTEGER NOT NULL CHECK (rate_bp_per_month >= 0),
    term_days INTEGER NOT NULL CHECK (term_days > 0),
    start_date TEXT NOT NULL,              -- YYYY-MM-DD
    due_date TEXT NOT NULL,
    interest_paid_to TEXT NOT NULL,        -- interest has been settled up to this date
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REDEEMED','FORFEITED')),
    appraised_value INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_pawn_status_due ON pawn_contracts(status, due_date);
  CREATE INDEX idx_pawn_customer ON pawn_contracts(customer_id);
  CREATE TABLE pawn_items (
    id INTEGER PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES pawn_contracts(id),
    description TEXT NOT NULL,
    weight_mg INTEGER NOT NULL CHECK (weight_mg > 0),
    purity_bp INTEGER NOT NULL CHECK (purity_bp > 0 AND purity_bp <= 10000),
    appraised_value INTEGER NOT NULL DEFAULT 0,
    stock_item_id INTEGER REFERENCES items(id)     -- set when forfeited into stock
  );
  -- Every cash event on a contract: open (principal out), renew (interest in), redeem, partial principal payment, forfeit.
  CREATE TABLE pawn_events (
    id INTEGER PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES pawn_contracts(id),
    kind TEXT NOT NULL CHECK (kind IN ('OPEN','RENEW','PAY_PRINCIPAL','REDEEM','FORFEIT')),
    principal_amount INTEGER NOT NULL DEFAULT 0,   -- signed from shop view: OPEN = -principal out, others +in
    interest_amount INTEGER NOT NULL DEFAULT 0,
    method TEXT CHECK (method IN ('CASH','CARD','TRANSFER','OTHER')),
    period_from TEXT, period_to TEXT, new_due_date TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_pawn_events_contract ON pawn_events(contract_id);

  -- ออมทอง: CASH mode keeps a money balance; GOLD_WEIGHT mode converts every deposit to mg at that day's rate.
  CREATE TABLE savings_accounts (
    id INTEGER PRIMARY KEY,
    account_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    plan TEXT NOT NULL CHECK (plan IN ('FIXED','FLEXIBLE')),
    mode TEXT NOT NULL CHECK (mode IN ('CASH','GOLD_WEIGHT')),
    purity_bp INTEGER NOT NULL DEFAULT 9650,
    installment_amount INTEGER,                    -- FIXED plans
    frequency TEXT CHECK (frequency IN ('WEEKLY','MONTHLY')),
    target_amount INTEGER,
    start_date TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,            -- money deposited and not yet used
    gold_mg INTEGER NOT NULL DEFAULT 0,            -- GOLD_WEIGHT mode accumulated weight
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CLOSED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE savings_entries (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES savings_accounts(id),
    kind TEXT NOT NULL CHECK (kind IN ('DEPOSIT','REDEEM','REFUND')),
    amount INTEGER NOT NULL,                       -- + deposit, - redeem/refund
    gold_mg INTEGER NOT NULL DEFAULT 0,            -- signed, GOLD_WEIGHT mode
    rate_per_gram INTEGER,                         -- rate snapshot used for conversion
    method TEXT CHECK (method IN ('CASH','CARD','TRANSFER','OTHER')),
    transaction_id INTEGER REFERENCES transactions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_savings_entries_acc ON savings_entries(account_id);

  -- Loyalty
  CREATE TABLE points_ledger (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('EARN','REDEEM','ADJUST','VOID')),
    transaction_id INTEGER REFERENCES transactions(id),
    reward_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_points_customer ON points_ledger(customer_id);
  CREATE TABLE rewards (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    points_cost INTEGER NOT NULL CHECK (points_cost > 0),
    stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    active INTEGER NOT NULL DEFAULT 1
  );

  -- Tax documents. A transaction can have several (abbreviated receipt, full tax invoice, credit note).
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('TAX_INVOICE_ABBR','TAX_INVOICE_FULL','PURCHASE_VOUCHER','CREDIT_NOTE')),
    doc_no TEXT NOT NULL UNIQUE,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    buyer_name TEXT, buyer_tax_id TEXT, buyer_address TEXT, buyer_branch TEXT,
    seller_snapshot TEXT NOT NULL,        -- JSON: shop name/tax id/address/branch at issue time
    amount_before_tax INTEGER NOT NULL,
    tax INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CANCELLED')),
    issued_by INTEGER NOT NULL REFERENCES users(id),
    issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_documents_tx ON documents(transaction_id);
  -- Outbox for the Revenue Department (e-Tax) connector: a worker drains PENDING rows.
  CREATE TABLE etax_outbox (
    id INTEGER PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- Income / expense entries that do not come from transactions (rent, salary, utilities…).
  -- Pawn interest and sales are derived from their own tables in reports.
  CREATE TABLE ledger_entries (
    id INTEGER PRIMARY KEY,
    entry_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE')),
    category TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    memo TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_ledger_date ON ledger_entries(entry_date);

  INSERT INTO settings(key,value) VALUES
    ('shop_tax_id',''), ('shop_address',''), ('shop_branch','00000'),
    ('pawn_max_rate_bp_per_month','125'),   -- 15 % p.a. cap; verify against current law before relying on it
    ('pawn_default_term_days','30'),
    ('pawn_grace_days','0'),
    ('points_minor_per_point','10000'),     -- 1 point per 100.00 of sale total
    ('savings_default_purity_bp','9650');
  `,
];

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
