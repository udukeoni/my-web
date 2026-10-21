// functions/api/rebalance.js
// 밴드리밸런싱 목표비중(target_weight) 일괄 갱신 및 밴드 상하한(±2%) 자동 계산 D1 DB 반영

export async function onRequestPut(context) {
    const { request, env } = context;

    try {
        const db = env.DB;
        const body = await request.json();
        const { account_id, updates } = body;

        if (!account_id || !Array.isArray(updates) || updates.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "필수 데이터(계좌ID 또는 비중 목록)가 누락되었습니다." 
            }), { 
                status: 400, 
                headers: { "Content-Type": "application/json; charset=UTF-8" } 
            });
        }

        const statements = [];

        for (const item of updates) {
            const ticker = item.ticker;
            const targetWeight = Number(item.target_weight);

            if (isNaN(targetWeight) || targetWeight < 0) continue;

            // 💡 규칙: 밴드하한과 밴드상한은 목표비중의 각각 -2%, +2%
            const bandMin = Math.max(0, Number((targetWeight - 2.0).toFixed(2)));
            const bandMax = Number((targetWeight + 2.0).toFixed(2));

            // rebalance_settings 테이블에 INSERT OR REPLACE (존재 시 업데이트)
            statements.push(
                db.prepare(`
                    INSERT INTO rebalance_settings (account_id, ticker, target_weight, band_min, band_max)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(account_id, ticker) DO UPDATE SET
                        target_weight = excluded.target_weight,
                        band_min = excluded.band_min,
                        band_max = excluded.band_max
                `).bind(account_id, ticker, targetWeight, bandMin, bandMax)
            );
        }

        if (statements.length > 0) {
            await db.batch(statements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: "목표비중 및 리밸런싱 밴드(±2%)가 성공적으로 업데이트되었습니다."
        }), {
            headers: { 
                "Content-Type": "application/json; charset=UTF-8", 
                "Cache-Control": "no-cache" 
            }
        });

    } catch (err) {
        console.error("리밸런싱 설정 수정 에러:", err);
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}