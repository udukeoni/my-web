// functions/api/snapshot-daily.js

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. 현재 한국 시간(KST) 기준 날짜(YYYY-MM-DD) 구하기
        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dateStr = kstTime.toISOString().split('T')[0];

        // 2. 각 계좌별 현재 보유 주식 평가금 및 총 매입원가 집계
        const accHoldings = await db.prepare(`
            SELECT 
                h.account_id,
                SUM(h.quantity * h.avg_buy_price) as invested,
                SUM(h.quantity * a.current_price) as stock_eval
            FROM holdings h
            JOIN assets a ON h.ticker = a.ticker
            GROUP BY h.account_id
        `).all();

        // 3. 각 계좌별 예수금 조회
        const accounts = await db.prepare("SELECT account_id, cash_balance FROM accounts").all();
        const accMap = {};
        (accounts.results || []).forEach(a => {
            accMap[a.account_id] = { cash: a.cash_balance || 0, invested: 0, stock_eval: 0 };
        });

        (accHoldings.results || []).forEach(h => {
            if (accMap[h.account_id]) {
                accMap[h.account_id].invested = h.invested || 0;
                accMap[h.account_id].stock_eval = h.stock_eval || 0;
            }
        });

        let totalInvested = 0;
        let totalNetWorth = 0;
        const statements = [];

        // 4. 개별 계좌 최종 일별 스냅샷 생성 (당일 중복 실행 시 덮어쓰기)
        for (const [accId, info] of Object.entries(accMap)) {
            const accNetWorth = info.stock_eval + info.cash;
            const accTotalInvested = info.invested + info.cash;
            totalInvested += accTotalInvested;
            totalNetWorth += accNetWorth;

            statements.push(
                db.prepare(`
                    INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                        invested = excluded.invested,
                        net_worth = excluded.net_worth
                `).bind(dateStr, accId, accTotalInvested, accNetWorth)
            );
        }

        // 5. 전체 계좌 종합('ALL') 최종 일별 스냅샷 생성
        statements.push(
            db.prepare(`
                INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                    invested = excluded.invested,
                    net_worth = excluded.net_worth
            `).bind(dateStr, 'ALL', totalInvested, totalNetWorth)
        );

        // 6. 일괄 실행
        if (statements.length > 0) {
            await db.batch(statements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `${dateStr} 일별 최종 자산 스냅샷 영구 저장 완료`,
            date: dateStr,
            totalNetWorth,
            totalInvested
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        console.error("일별 스냅샷 에러:", err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}