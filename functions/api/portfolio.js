// functions/api/portfolio.js
// 계좌/보유종목/거래원장 및 시계열 차트 데이터 집계 + 자산배분 밴드리밸런싱 자동 연산

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const accountFilter = url.searchParams.get('account') || 'ALL';
    const viewType = url.searchParams.get('view') || 'HOLDINGS';

    try {
        const db = env.DB;

        // 1. 전체 계좌 목록 조회
        const accountsResult = await db.prepare("SELECT * FROM accounts ORDER BY account_id ASC").all();
        const accounts = accountsResult.results || [];

        const accountNameMap = {};
        accounts.forEach(a => {
            if (a.account_id) accountNameMap[a.account_id] = a.account_name;
        });

        // 2. 전체 종목 마스터 조회
        const assetsResult = await db.prepare("SELECT ticker, asset_name FROM assets").all();
        const assetNameMap = {};
        (assetsResult.results || []).forEach(ast => {
            if (ast.ticker) assetNameMap[ast.ticker] = ast.asset_name;
        });

        // 3. 보유 종목 상세 조회
        let holdingsQuery = `
            SELECT 
                h.holding_id,
                h.account_id,
                ac.account_name,
                h.ticker,
                a.asset_name,
                a.sector,
                h.quantity,
                h.avg_buy_price,
                a.current_price,
                0 AS daily_change_rate,
                (h.quantity * h.avg_buy_price) AS buy_amount,
                (h.quantity * a.current_price) AS eval_amount,
                ((h.quantity * a.current_price) - (h.quantity * h.avg_buy_price)) AS profit_amount,
                ROUND(((a.current_price - h.avg_buy_price) * 100.0 / h.avg_buy_price), 2) AS profit_rate
            FROM holdings h
            JOIN accounts ac ON h.account_id = ac.account_id
            JOIN assets a ON h.ticker = a.ticker
        `;

        const holdingsParams = [];
        if (accountFilter !== 'ALL') {
            holdingsQuery += " WHERE h.account_id = ?";
            holdingsParams.push(accountFilter);
        }
        holdingsQuery += " ORDER BY eval_amount DESC";

        const holdingsStmt = db.prepare(holdingsQuery);
        const holdingsResult = holdingsParams.length > 0 
            ? await holdingsStmt.bind(...holdingsParams).all() 
            : await holdingsStmt.all();
        const holdings = holdingsResult.results || [];

        // 4. 거래원장 (trade_logs) 조회
        let rawLogs = [];
        let logQuery = "SELECT * FROM trade_logs";
        const logConditions = [];
        const logParams = [];

        if (accountFilter !== 'ALL') {
            logConditions.push("account_id = ?");
            logParams.push(accountFilter);
        }

        if (viewType === 'TRADE') {
            logConditions.push("trade_type IN ('매수', '매도')");
        } else if (viewType === 'DIVIDEND') {
            logConditions.push("trade_type IN ('분배금', '배당금')");
        } else if (viewType === 'TRANSFER') {
            logConditions.push("trade_type IN ('입금', '출금', '이자')");
        }

        if (logConditions.length > 0) {
            logQuery += " WHERE " + logConditions.join(" AND ");
        }
        logQuery += " ORDER BY trade_date DESC, trade_id DESC LIMIT 1000";

        try {
            const logStmt = db.prepare(logQuery);
            const logResult = logParams.length > 0 
                ? await logStmt.bind(...logParams).all() 
                : await logStmt.all();
            rawLogs = logResult.results || [];
        } catch (logErr) {
            console.error("trade_logs 조회 예외:", logErr.message);
            rawLogs = [];
        }

        const logs = rawLogs.map(item => {
            const accName = accountNameMap[item.account_id] || item.account_id || '계좌';
            let displayAssetName = assetNameMap[item.ticker] || item.ticker || '-';

            if (item.ticker === 'CASH') {
                displayAssetName = '원화 현금';
            } else if (item.trade_type === '이자') {
                displayAssetName = `${accName} 이자`;
            }

            return {
                ...item,
                account_name: accName,
                display_asset_name: displayAssetName
            };
        });

        // 5. 예수금 및 요약 집계
        let targetCash = 0;
        if (accountFilter === 'ALL') {
            targetCash = accounts.reduce((acc, cur) => acc + (cur.cash_balance || 0), 0);
        } else {
            const foundAcc = accounts.find(a => a.account_id === accountFilter);
            targetCash = foundAcc ? (foundAcc.cash_balance || 0) : 0;
        }

        const totalStockEval = holdings.reduce((acc, cur) => acc + (cur.eval_amount || 0), 0);
        const totalInvested = holdings.reduce((acc, cur) => acc + (cur.buy_amount || 0), 0);
        const totalProfit = totalStockEval - totalInvested;
        const netWorth = totalStockEval + targetCash;

        const stockProfitRate = totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0;
        const totalAssetInvested = totalInvested + targetCash;
        const netProfitRate = totalAssetInvested > 0 ? Number(((totalProfit / totalAssetInvested) * 100).toFixed(2)) : 0;
        const cashWeight = netWorth > 0 ? Number(((targetCash / netWorth) * 100).toFixed(1)) : 0;

        // -------------------------------------------------------------
        // 💡 6. [신규] 리밸런싱 설정값 조회 및 계산 맵 구성
        // -------------------------------------------------------------
        let rebalanceSettingsMap = new Map();
        try {
            const rebQuery = accountFilter === 'ALL'
                ? "SELECT account_id, ticker, target_weight, band_min, band_max FROM rebalance_settings"
                : "SELECT account_id, ticker, target_weight, band_min, band_max FROM rebalance_settings WHERE account_id = ?";
            const rebStmt = db.prepare(rebQuery);
            const rebRes = accountFilter === 'ALL' ? await rebStmt.all() : await rebStmt.bind(accountFilter).all();
            (rebRes.results || []).forEach(r => {
                rebalanceSettingsMap.set(`${r.account_id}_${r.ticker}`, r);
            });
        } catch (rebErr) {
            console.error("리밸런싱 설정 조회 예외:", rebErr.message);
        }

        // 종목별 비중 및 밴드리밸런싱 자동 연산
        const holdingsWithWeight = holdings.map(item => {
            const currentEval = item.eval_amount || 0;
            // 순자산(주식평가금 + 예수금) 대비 현재 비중 (%)
            const currentWeight = netWorth > 0 ? Number(((currentEval / netWorth) * 100).toFixed(2)) : 0;

            // 리밸런싱 설정값 조회
            const settingKey = `${item.account_id}_${item.ticker}`;
            const setting = rebalanceSettingsMap.get(settingKey);

            let targetWeight = null;
            let bandMin = null;
            let bandMax = null;
            let status = '미설정';
            let diffAmount = 0;   // 목표 비중 달성을 위한 매수/매도 필요 금액
            let adjustShares = 0; // 조정 주식 수

            if (setting) {
                targetWeight = Number(setting.target_weight);
                bandMin = Number(setting.band_min);
                bandMax = Number(setting.band_max);

                // 상태 판정: 하한 미달이면 '매수', 상한 초과면 '매도', 범위 안이면 '유지'
                if (currentWeight < bandMin) {
                    status = '매수';
                } else if (currentWeight > bandMax) {
                    status = '매도';
                } else {
                    status = '유지';
                }

                // 목표 금액 = 총 순자산 * (목표 비중 / 100)
                const targetEval = netWorth * (targetWeight / 100);
                // 매수/매도 필요 금액 = 목표 금액 - 현재 평가금액
                diffAmount = Math.round(targetEval - currentEval);

                // 조정 주식 수 = 필요 금액 / 현재가
                if (item.current_price > 0) {
                    adjustShares = Math.round(diffAmount / item.current_price);
                }
            }

            return {
                ...item,
                weight: currentWeight,
                target_weight: targetWeight,
                band_min: bandMin,
                band_max: bandMax,
                rebalance_status: status,
                diff_amount: diffAmount,
                adjust_shares: adjustShares
            };
        });

        // 7. 자산 추이 그래프 데이터 조회
        let intradayHistory = [];
        let dailyHistory = [];

        try {
            const intraQuery = accountFilter === 'ALL'
                ? "SELECT recorded_at, net_worth, invested FROM intraday_snapshots WHERE account_id = 'ALL' ORDER BY id ASC"
                : "SELECT recorded_at, net_worth, invested FROM intraday_snapshots WHERE account_id = ? ORDER BY id ASC";
            const intraStmt = db.prepare(intraQuery);
            const intraRes = accountFilter === 'ALL' ? await intraStmt.all() : await intraStmt.bind(accountFilter).all();
            intradayHistory = intraRes.results || [];

            const dailyQuery = accountFilter === 'ALL'
                ? "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = 'ALL' ORDER BY snapshot_date ASC"
                : "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = ? ORDER BY snapshot_date ASC";
            const dailyStmt = db.prepare(dailyQuery);
            const dailyRes = accountFilter === 'ALL' ? await dailyStmt.all() : await dailyStmt.bind(accountFilter).all();
            dailyHistory = dailyRes.results || [];
        } catch (chartErr) {
            console.error("차트 데이터 조회 에러:", chartErr.message);
        }

        return new Response(JSON.stringify({
            success: true,
            accountFilter,
            viewType,
            summary: {
                netWorth,
                totalStockEval,
                cashBalance: targetCash,
                invested: totalInvested,
                profitAmount: totalProfit,
                stockProfitRate,
                netProfitRate,
                cashWeight
            },
            accounts,
            holdings: holdingsWithWeight,
            logs,
            chartData: {
                intraday: intradayHistory,
                daily: dailyHistory
            }
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}