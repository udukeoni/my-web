-- 1. 파킹통장 및 CMA 계좌 추가
INSERT OR REPLACE INTO accounts (account_id, account_name, broker, account_type, strategy, cash_balance) VALUES
('WELCOME_PARK', '웰컴저축은행', '웰컴저축은행', '파킹통장', '비상금 파킹', 0),
('SAMSUNG_CMA', '삼성-CMA', '삼성증권', '수시입출금', 'CMA RP형', 0);

-- 2. 누락된 4개 종목 마스터 등록
INSERT OR REPLACE INTO assets (ticker, asset_name, sector, current_price) VALUES
('0193T0', 'KODEX SK하이닉스단일종목레버리지', '반도체·IT', 6980),
('0105E0', 'SOL 코리아고배당', '배당·인컴', 12350),
('458730', 'TIGER 미국배당다우존스', '배당·인컴', 14250),
('488770', 'KODEX 머니마켓액티브', '단기현금·파킹', 105815);

-- 3. 누락된 미래에셋, 삼성-ISA 보유 포지션 등록
INSERT OR REPLACE INTO holdings (account_id, ticker, quantity, avg_buy_price) VALUES
('MIRAE_01', '0193T0', 30, 9835),
('MIRAE_01', '0105E0', 15, 12795),
('SAMSUNG_ISA', '458730', 266, 14805),
('SAMSUNG_ISA', '488770', 35, 105550);