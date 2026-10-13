// functions/api/portfolio.js

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const accountFilter = url.searchParams.get('account') || 'ALL';
    const viewType = url.searchParams.get('view') || 'HOLDINGS'; // HOLDINGS | ALL_LOGS | TRADE | DIVIDEND | TRANSFER

    try {
        const db = env.DB;

        // 1. 전체 계좌 목록 및 예수금 조회
        const accountsResult = await db.prepare(
            `SELECT account_id, account_name, broker, account_type, cash_balance FROM accounts`
        ).all();
        const accounts = accountsResult.results;

        // 2. 보유 종목 리스트 조회
        let holdingsQuery = `
            SELECT 
                h.account_id,
                a.account_name,
                h.ticker,
                ast.asset_name,
                ast.sector,
                h.quantity,
                h.avg_buy_price,
                ast.current_price,
                (h.quantity * ast.current_price) AS eval_amount,
                (h.quantity * h.avg_buy_price) AS buy_amount,
                ((h.quantity * ast.current_price) - (h.quantity * h.avg_buy_price)) AS profit_amount,
                ROUND(CAST((ast.current_price - h.avg_buy_price) AS REAL) / h.avg_buy_price * 100, 2) AS profit_rate
            FROM holdings h
            JOIN accounts a ON h.account_id = a.account_id
            JOIN assets ast ON h.ticker = ast.ticker
        `;

        let holdingsResult;
        if (accountFilter !== 'ALL') {
            holdingsQuery += ` WHERE h.account_id = ? ORDER BY eval_amount DESC`;
            holdingsResult = await db.prepare(holdingsQuery).bind(accountFilter).all();
        } else {
            holdingsQuery += ` ORDER BY eval_amount DESC`;
            holdingsResult = await db.prepare(holdingsQuery).all();
        }
        const holdings = holdingsResult.results;

        // 3. 거래 내역 (trade_logs) 동적 조회
        let logConditions = [];
        let logBindings = [];

        if (accountFilter !== 'ALL') {
            logConditions.push("account_id = ?");
            logBindings.push(accountFilter);
        }

        if (viewType === 'TRADE') {
            logConditions.push("trade_type IN ('매수', '매도')");
        } else if (viewType === 'DIVIDEND') {
            logConditions.push("trade_type IN ('배당', '분배금')");
        } else if (viewType === 'TRANSFER') {
            logConditions.push("trade_type IN ('입금', '출금')");
        }

        let logsQuery = `SELECT * FROM trade_logs`;
        if (logConditions.length > 0) {
            logsQuery += ` WHERE ` + logConditions.join(' AND ');
        }
        logsQuery += ` ORDER BY trade_date DESC, trade_id DESC LIMIT 100`;

        let logsStmt = db.prepare(logsQuery);
        if (logBindings.length > 0) {
            logsStmt = logsStmt.bind(...logBindings);
        }
        const logsResult = await logsStmt.all();
        const logs = logsResult.results;

        // 4. 예수금 및 요약 집계
        let targetCash = 0;
        if (accountFilter === 'ALL') {
            targetCash = accounts.reduce((acc, cur) => acc + (cur.cash_balance || 0), 0);
        } else {
            const foundAcc = accounts.find(a => a.account_id === accountFilter);
            targetCash = foundAcc ? foundAcc.cash_balance : 0;
        }

        const totalStockEval = holdings.reduce((acc, cur) => acc + (cur.eval_amount || 0), 0);
        const totalInvested = holdings.reduce((acc, cur) => acc + (cur.buy_amount || 0), 0);
        const totalProfit = totalStockEval - totalInvested;
        const netWorth = totalStockEval + targetCash;

        // 1) 순수 주식 손익률 (주식 매입원가 기준)
        const stockProfitRate = totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0;

        // 2) 총자산 기준 총 투자원금 (주식 원가 + 예수금)
        const totalAssetInvested = totalInvested + targetCash;
        // 3) 총자산 손익률 (예수금 포함 전체 원금 기준)
        const netProfitRate = totalAssetInvested > 0 ? Number(((totalProfit / totalAssetInvested) * 100).toFixed(2)) : 0;

        // 4) 예수금 비중
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
                stockProfitRate,      // 순수 주식 수익률
                netProfitRate,        // 총자산 기준 수익률
                cashWeight            // 현금 비중
            },
            accounts,
            holdings: holdingsWithWeight,
            logs
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}