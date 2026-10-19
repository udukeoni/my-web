-- sql/create_rebalance.sql
-- 미래에셋 계좌 자산배분 밴드리밸런싱 설정 테이블 생성 및 스프레드시트 기준값 초기 적재

CREATE TABLE IF NOT EXISTS rebalance_settings (
    account_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    target_weight REAL NOT NULL DEFAULT 0.0, -- 목표 비중 (%)
    band_min REAL NOT NULL DEFAULT 0.0,       -- 밴드 하한 (%)
    band_max REAL NOT NULL DEFAULT 0.0,       -- 밴드 상한 (%)
    PRIMARY KEY (account_id, ticker)
);

-- 미래에셋(연금) 계좌(미래-연금) 기준 스프레드시트 8대 자산(주식 7종 + 현금) 기준값 적재
INSERT INTO rebalance_settings (account_id, ticker, target_weight, band_min, band_max)
VALUES
    ('미래-연금', '0022T0', 10.0, 8.0, 12.0),  -- SOL 국제금커버드콜액티브
    ('미래-연금', '441640', 25.0, 20.0, 30.0), -- KODEX 미국배당커버드콜액티브
    ('미래-연금', '0008S0', 10.0, 8.0, 12.0),  -- TIGER 미국배당다우존스타겟데일리커버드
    ('미래-연금', '486290', 10.0, 8.0, 12.0),  -- TIGER 미국나스닥100타겟데일리커버드콜
    ('미래-연금', '379800', 20.0, 16.0, 24.0), -- KODEX 미국S&P500
    ('미래-연금', '490590', 10.0, 8.0, 12.0),  -- RISE 미국AI밸류체인데일리고정커버드콜
    ('미래-연금', '473330', 5.0,  4.0,  6.0),   -- SOL 미국30년국채커버드콜(합성)
    ('미래-연금', 'CASH',   10.0, 8.0, 12.0)   -- 예수금 (원화 현금)
ON CONFLICT(account_id, ticker) DO UPDATE SET
    target_weight = excluded.target_weight,
    band_min = excluded.band_min,
    band_max = excluded.band_max;