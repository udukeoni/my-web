// functions/api/trade.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const db = env.DB;
        const body = await request.json();

        const {
            trade_date,
            account_id,
            trade_type,
            ticker,
            quantity = 0,
            unit_price = 0,
            settle_amount = 0,
            tax = 0,
            memo = ''
        } = body;

        // 필수 값 검증
        if (!trade_date || !account_id || !trade_type || !ticker) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "필수 항목(거래일자, 계좌, 구분, 종목)이 누락되었습니다." 
            }), {
                status: 400,
                headers: { "Content-Type": "application/json; charset=UTF-8" }
            });
        }

        // D1 DB trade_logs 테이블에 신규 거래내역 등록
        const stmt = db.prepare(`
            INSERT INTO trade_logs (
                trade_date, 
                account_id, 
                trade_type, 
                ticker, 
                quantity, 
                unit_price, 
                settle_amount, 
                fee, 
                memo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        await stmt.bind(
            trade_date,
            account_id,
            trade_type,
            ticker,
            Number(quantity) || 0,
            Number(unit_price) || 0,
            Number(settle_amount) || 0,
            Number(tax) || 0,
            memo || ''
        ).run();

        return new Response(JSON.stringify({
            success: true,
            message: "거래내역이 성공적으로 저장되었습니다."
        }), {
            headers: { 
                "Content-Type": "application/json; charset=UTF-8",
                "Cache-Control": "no-cache"
            }
        });

    } catch (err) {
        console.error("거래내역 저장 에러:", err);
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}