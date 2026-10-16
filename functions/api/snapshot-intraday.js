// functions/api/snapshot-intraday.js

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. 현재 한국 시간(KST) 구하기
        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const hours = kstTime.getUTCHours();
        const minutes = kstTime.getUTCMinutes();
        
        // 💡 09:00 ~ 09:15 사이에 실행되면 무조건 깔끔하게 '09:00'을 시작점으로 강제 고정
        let timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const isMarketOpen = (hours === 9 && minutes <= 15);
        if (isMarketOpen) {
            timeStr = '09:00';
        }

        const statements = [];

        // 2. 아침 개장 첫 실행 시(09:00) 전날 임시 데이터 자동 비우기
        if (isMarketOpen) {
            statements.push(db.prepare("DELETE FROM intraday_snapshots"));
        }

        // 3. 각 계좌별 현재 보유 주식 평가금 및 매입원가 집계
        const accHoldings = await db.prepare(`
            SELECT 
                h.account_id,
                SUM(h.quantity * h.avg_buy_price) as invested,
                SUM(h.quantity * a.current_price) as stock_eval
            FROM holdings h
            JOIN assets a ON h.ticker = a.ticker
            GROUP BY h.account_id
        `).all();

        // 4. 각 계좌별 예수금 조회
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

        // 5. 개별 계좌 스냅샷 쿼리 생성
        for (const [accId, info] of Object.entries(accMap)) {
            const accNetWorth = info.stock_eval + info.cash;
            const accTotalInvested = info.invested + info.cash;
            totalInvested += accTotalInvested;
            totalNetWorth += accNetWorth;

            statements.push(
                db.prepare("INSERT INTO intraday_snapshots (recorded_at, account_id, net_worth, invested) VALUES (?, ?, ?, ?)")
                  .bind(timeStr, accId, accNetWorth, accTotalInvested)
            );
        }

        // 6. 전체 계좌 종합('ALL') 스냅샷 쿼리 생성
        statements.push(
            db.prepare("INSERT INTO intraday_snapshots (recorded_at, account_id, net_worth, invested) VALUES (?, ?, ?, ?)")
              .bind(timeStr, 'ALL', totalNetWorth, totalInvested)
        );

        // 7. 한 번에 안전하게 일괄 실행
        if (statements.length > 0) {
            await db.batch(statements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: isMarketOpen ? "장 시작(09:00) 기준점 초기화 및 기록 완료" : "장중 자산 스냅샷 기록 완료",
            timeRecorded: timeStr,
            isReset: isMarketOpen
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        console.error("장중 스냅샷 에러:", err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}