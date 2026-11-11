// functions/api/snapshot-daily.js
export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dateStr = kstTime.toISOString().split('T')[0];
        
        const pad = (n) => String(n).padStart(2, '0');
        const kstDateTimeStr = `${kstTime.getFullYear()}-${pad(kstTime.getMonth() + 1)}-${pad(kstTime.getDate())} ${pad(kstTime.getHours())}:${pad(kstTime.getMinutes())}:${pad(kstTime.getSeconds())}`;

        // 1. 등록된 모든 계좌 목록 및 소유주(user_id) 조회
        const accountsResult = await db.prepare("SELECT account_id, cash_balance, user_id FROM accounts").all();
        const accounts = accountsResult.results || [];

        // 2. 전체 계좌별 보유 주식의 매입원가 및 현재 평가금 집계
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

        const holdingsMap = {};
        (accHoldings.results || []).forEach(h => {
            holdingsMap[h.account_id] = {
                invested: Math.round(h.invested || 0),
                stock_eval: Math.round(h.stock_eval || 0)
            };
        });

        // 3. 계정주(user_id)별 독립 집계 맵 구성
        const userSummaryMap = {}; // { 'antmaster84': { invested, net_worth }, 'workerant01': { ... } }
        const statements = [];

        for (const acc of accounts) {
            const userId = acc.user_id || 'antmaster84';
            const h = holdingsMap[acc.account_id] || { invested: 0, stock_eval: 0 };
            const cash = acc.cash_balance || 0;

            const accNetWorth = Math.round(h.stock_eval + cash);
            const accTotalInvested = Math.round(h.invested + cash);

            // (A) 개별 계좌 고유 스냅샷 기록
            statements.push(
                db.prepare(`
                    INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                        invested = excluded.invested,
                        net_worth = excluded.net_worth,
                        updated_at = excluded.updated_at
                `).bind(dateStr, String(acc.account_id), Number(accTotalInvested), Number(accNetWorth), String(kstDateTimeStr))
            );

            // (B) 해당 계정주(user_id)의 총합 누적
            if (!userSummaryMap[userId]) {
                userSummaryMap[userId] = { invested: 0, net_worth: 0 };
            }
            userSummaryMap[userId].invested += accTotalInvested;
            userSummaryMap[userId].net_worth += accNetWorth;
        }

        // 4. 💡 모든 사용자(antmaster84, workerant01, workerant02 등)별 고유 전체 종합 스냅샷 생성 ({user_id}_ALL)
        for (const [userId, summary] of Object.entries(userSummaryMap)) {
            const userTotalKey = `${userId}_ALL`;

            statements.push(
                db.prepare(`
                    INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                        invested = excluded.invested,
                        net_worth = excluded.net_worth,
                        updated_at = excluded.updated_at
                `).bind(dateStr, userTotalKey, Number(summary.invested), Number(summary.net_worth), String(kstDateTimeStr))
            );

            // antmaster84는 과거 데이터 하위호환을 위해 기존 'ALL' 레코드도 함께 동기화
            if (userId === 'antmaster84') {
                statements.push(
                    db.prepare(`
                        INSERT INTO daily_snapshots (snapshot_date, account_id, invested, net_worth, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
                            invested = excluded.invested,
                            net_worth = excluded.net_worth,
                            updated_at = excluded.updated_at
                    `).bind(dateStr, 'ALL', Number(summary.invested), Number(summary.net_worth), String(kstDateTimeStr))
                );
            }
        }

        if (statements.length > 0) {
            await db.batch(statements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `${dateStr} 사용자별 {user_id}_ALL 독립 일별 자산 스냅샷 집계 완료`,
            date: dateStr,
            updatedAt: kstDateTimeStr,
            users: Object.keys(userSummaryMap)
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        console.error("일별 스냅샷 생성 오류:", err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}