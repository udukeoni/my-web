// functions/api/portfolio.js

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const accountFilter = url.searchParams.get('account') || 'ALL';

    try {
        const db = env.DB; // wrangler.toml의 binding = "DB" 연결

        // 1. 전체 계좌 목록 및 예수금 조회
        const accountsResult = await db.prepare(
            `SELECT account_id, account_name, broker, account_type, cash_balance FROM accounts`
        ).all();
        const accounts = accountsResult.results;

        // 2. 보유 종목 리스트 및 실시간 평가/손익 계산 쿼리
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

        // 3. 선택된 필터에 따른 예수금 및 종합 집계
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
        const totalProfitRate = totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0;

        // 4. 종목별 비중(%) 동적 산출
        const holdingsWithWeight = holdings.map(item => ({
            ...item,
            weight: totalStockEval > 0 ? Number(((item.eval_amount / totalStockEval) * 100).toFixed(2)) : 0
        }));

        return new Response(JSON.stringify({
            success: true,
            accountFilter,
            summary: {
                netWorth,
                totalStockEval,
                cashBalance: targetCash,
                invested: totalInvested,
                profitAmount: totalProfit,
                profitRate: totalProfitRate,
                annualDividend: 6537339
            },
            accounts,
            holdings: holdingsWithWeight
        }), {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "Cache-Control": "no-cache"
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}