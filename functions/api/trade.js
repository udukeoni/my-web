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

        // 필수 항목 검증
        if (!trade_date || !account_id || !trade_type || !ticker) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "필수 항목(거래일자, 계좌, 구분, 종목)이 누락되었습니다." 
            }), {
                status: 400,
                headers: { "Content-Type": "application/json; charset=UTF-8" }
            });
        }

        const settleVal = Number(settle_amount) || 0;
        const taxVal = Number(tax) || 0;

        // 1. 거래원장(trade_logs)에 기록 저장
        const insertLogStmt = db.prepare(`
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
        `).bind(
            trade_date,
            account_id,
            trade_type,
            ticker,
            Number(quantity) || 0,
            Number(unit_price) || 0,
            settleVal,
            taxVal,
            memo || ''
        );

        // 2. 거래 구분에 따른 예수금(cash_balance) 자동 증감 연동
        let updateCashStmt = null;

        // [+] 예수금 증가 항목: 분배금, 배당금, 이자, 입금, 매도
        // (세금/수수료가 있다면 차감된 순수 입금액만 예수금에 플러스)
        if (['분배금', '배당금', '이자', '입금', '매도'].includes(trade_type)) {
            const netInflow = settleVal - taxVal;
            updateCashStmt = db.prepare(`
                UPDATE accounts 
                SET cash_balance = cash_balance + ? 
                WHERE account_id = ?
            `).bind(netInflow, account_id);

        // [-] 예수금 차감 항목: 출금, 매수
        // (정산금액뿐만 아니라 수수료/세금까지 포함해서 예수금에서 같이 마이너스)
        } else if (['출금', '매수'].includes(trade_type)) {
            const totalOutflow = settleVal + taxVal;
            updateCashStmt = db.prepare(`
                UPDATE accounts 
                SET cash_balance = cash_balance - ? 
                WHERE account_id = ?
            `).bind(totalOutflow, account_id);
        }

        // 3. 원장 기록과 예수금 변동을 하나의 트랜잭션(Batch)으로 안전하게 묶어 실행
        const statements = [insertLogStmt];
        if (updateCashStmt) {
            statements.push(updateCashStmt);
        }

        await db.batch(statements);

        return new Response(JSON.stringify({
            success: true,
            message: "거래내역 저장 및 예수금 반영이 완료되었습니다."
        }), {
            headers: { 
                "Content-Type": "application/json; charset=UTF-8",
                "Cache-Control": "no-cache"
            }
        });

    } catch (err) {
        console.error("거래내역 처리 에러:", err);
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}