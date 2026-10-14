// functions/api/portfolio.js

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const accountFilter = url.searchParams.get('account') || 'ALL';
    const viewType = url.searchParams.get('view') || 'HOLDINGS';

    try {
        const db = env.DB;

        // 1. 전체 계좌 목록 조회 (created_at 제거 -> account_id로 안전 정렬)
        const accountsResult = await db.prepare("SELECT * FROM accounts ORDER BY account_id ASC").all();
        const accounts = accountsResult.results || [];

        // 계좌 ID -> 한글명 맵핑 사전
        const accountNameMap = {};
        accounts.forEach(a => {
            if (a.account_id) accountNameMap[a.account_id] = a.account_name;
        });

        // 2. 전체 종목 마스터 조회 (종목코드 -> 한글명 맵핑 사전)
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
                ROUND(((a.current_price - h.avg_buy_price) / h.avg_buy_price) * 100, 2) AS profit_rate
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

        // 4. 거래원장 (trade_logs) 안전 조회
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
            logConditions.push("trade_type = '분배금'");
        } else if (viewType === 'TRANSFER') {
            logConditions.push("trade_type IN ('입금', '출금', '이자')");
        }

        if (logConditions.length > 0) {
            logQuery += " WHERE " + logConditions.join(" AND ");
        }
        logQuery += " ORDER BY trade_date DESC LIMIT 1000";

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

        // 안전한 한글명 매핑
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

        const holdingsWithWeight = holdings.map(item => ({
            ...item,
            weight: totalStockEval > 0 ? Number(((item.eval_amount / totalStockEval) * 100).toFixed(2)) : 0
        }));

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
            logs
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