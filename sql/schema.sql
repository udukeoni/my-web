-- schema.sql
-- sleepingant Cloudflare D1 Database 통합 스키마 (최신 반영: 2026-11-05)

-- 1. 계좌 마스터 (accounts)
CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    broker TEXT NOT NULL,
    account_type TEXT NOT NULL,
    strategy TEXT,
    cash_balance INTEGER DEFAULT 0
);

-- 2. 종목 마스터 (assets) - 6시간 주기 자동 스케줄러로 current_price 실시간 갱신
CREATE TABLE IF NOT EXISTS assets (
    ticker TEXT PRIMARY KEY,
    asset_name TEXT NOT NULL,
    sector TEXT,
    current_price INTEGER DEFAULT 0
);

-- 3. 보유 종목 잔고 (holdings) - 증권사 원장 1원 단위 일치용 total_buy_amount 포함
CREATE TABLE IF NOT EXISTS holdings (
    holding_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_buy_price REAL NOT NULL,
    total_buy_amount INTEGER DEFAULT 0,
    target_weight REAL DEFAULT 0.0,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (ticker) REFERENCES assets(ticker),
    UNIQUE (account_id, ticker)
);

-- 4. 밴드리밸런싱 설정 (rebalance_settings)
CREATE TABLE IF NOT EXISTS rebalance_settings (
    setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    target_weight REAL NOT NULL DEFAULT 0.0,
    band_min REAL NOT NULL DEFAULT 0.0,
    band_max REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (account_id, ticker)
);

-- 5. 거래 원장 장부 (trade_logs)
CREATE TABLE IF NOT EXISTS trade_logs (
    trade_id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date TEXT NOT NULL,
    account_id TEXT NOT NULL,
    trade_type TEXT NOT NULL, -- 매수, 매도, 분배금, 배당금, 이자, 입금, 출금
    ticker TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    unit_price INTEGER DEFAULT 0,
    settle_amount INTEGER NOT NULL, -- 세전 금액 / 총 결제액
    fee INTEGER DEFAULT 0,          -- 수수료
    tax INTEGER DEFAULT 0,          -- 배당소득세 등 제세금
    memo TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 6. 일별 자산 추이 스냅샷 (daily_snapshots) - updated_at 독립 타임스탬프 포함
CREATE TABLE IF NOT EXISTS daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL, -- YYYY-MM-DD
    account_id TEXT NOT NULL,    -- 'ALL' 또는 개별 계좌ID
    invested INTEGER NOT NULL,
    net_worth INTEGER NOT NULL,
    updated_at TEXT,             -- KST 기준 고유 갱신 타임스탬프 (YYYY-MM-DD HH:mm:ss)
    UNIQUE (snapshot_date, account_id)
);

-- 7. 시장 공포탐욕지수 (fgi_data) - S&P500 / 가상자산
CREATE TABLE IF NOT EXISTS fgi_data (
    date TEXT PRIMARY KEY,
    score INTEGER NOT NULL,
    rating TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 8. 회원 및 로그인 감사 로그 (users, login_logs)
CREATE TABLE IF NOT EXISTS users (
    user_no INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT DEFAULT 'USER',
    status TEXT DEFAULT 'ACTIVE',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS login_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    login_status TEXT NOT NULL,
    attempt_time TEXT DEFAULT (datetime('now', 'localtime'))
);