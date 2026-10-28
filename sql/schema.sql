CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    broker TEXT NOT NULL,
    account_type TEXT NOT NULL,
    strategy TEXT,
    cash_balance INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
    ticker TEXT PRIMARY KEY,
    asset_name TEXT NOT NULL,
    sector TEXT,
    current_price INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS holdings (
    holding_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_buy_price INTEGER NOT NULL,
    total_buy_amount INTEGER DEFAULT 0,
    target_weight REAL DEFAULT 0.0,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (ticker) REFERENCES assets(ticker),
    UNIQUE (account_id, ticker)
);

CREATE TABLE IF NOT EXISTS trade_logs (
    trade_id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date TEXT NOT NULL,
    account_id TEXT NOT NULL,
    trade_type TEXT NOT NULL,
    ticker TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    settle_amount INTEGER NOT NULL,
    fee INTEGER DEFAULT 0,
    memo TEXT
);