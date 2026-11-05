// functions/api/snapshot-daily.js
// 전체 계좌(ALL) 및 개별 계좌별 당일 자산 스냅샷 db.batch 일괄 생성 + total_buy_amount 1원 단위 정합성 + updated_at 고유 타임스탬프 기록

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. 한국 시간(KST) 기준 날짜(YYYY-MM-DD) 및 타임스탬프(YYYY-MM-DD HH:mm:ss) 생성
        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dateStr = kstTime.toISOString().split('T')[0];
        
        const pad = (n) => String(n).padStart(2, '0');
        const kstDateTimeStr = `${kstTime.getFullYear()}-${pad(kstTime.getMonth() + 1)}-${pad(kstTime.getDate())} ${pad(kstTime.getHours())}:${pad(kstTime.getMinutes())}:${pad(kstTime.getSeconds())}`;

        // 2. 각 계좌별 보유 주식 평가금 및 총 매입원가(total_buy_amount 우선) 집계
        const accHoldings = await db.prepare(`
            SELECT 
                h.account_id,
                SUM(
                    CASE 
                        WHEN h.total_buy_amount > 0 THEN h.total_buy_amount 
                        ELSE ROUND(h.quantity * h.avg_buy_price) 
                    END
                ) as invested,
                SUM(ROUND(h.quantity * a.current_price)) as stock_eval
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
                accMap[h.account_id].invested = Math.round(h.invested || 0);
                accMap[h.account_id].stock_eval = Math.round(h.stock_eval || 0);
            }
        });

        let totalInvested = 0;
        let totalNetWorth = 0;
        const statements = [];

        // 4. 개별 계좌 최종 일별 스냅샷 생성 (물음표 5개, bind 값 5개 일치)
        for (const [accId, info] of Object.entries(accMap)) {
            const accNetWorth = Math.round(info.stock_eval + info.cash);
            const accTotalInvested = Math.round(info.invested + info.cash);
            totalInvested += accTotalInvested;
            totalNetWorth += accNetWorth;

            statements.push(
                db.prepare(`
                    INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                        invested = excluded.invested,
                        net_worth = excluded.net_worth,
                        updated_at = excluded.updated_at
                `).bind(dateStr, String(accId), Number(accTotalInvested), Number(accNetWorth), String(kstDateTimeStr))
            );
        }

        // 5. 전체 계좌 종합('ALL') 최종 일별 스냅샷 생성 (물음표 5개, bind 값 5개 완벽 일치)
        statements.push(
            db.prepare(`
                INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                    invested = excluded.invested,
                    net_worth = excluded.net_worth,
                    updated_at = excluded.updated_at
            `).bind(dateStr, 'ALL', Number(totalInvested), Number(totalNetWorth), String(kstDateTimeStr))
        );

        // 6. 원본 방식 그대로 db.batch 일괄 실행 (안전한 원자적 저장)
        if (statements.length > 0) {
            await db.batch(statements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `${dateStr} 일별 최종 자산 스냅샷 영구 저장 완료`,
            date: dateStr,
            updatedAt: kstDateTimeStr,
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