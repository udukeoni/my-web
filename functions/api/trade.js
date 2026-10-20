// functions/api/trade.js

const BASE_FIXED_TRADE_ID = 0; // 초기화

// 자산 증감(현금 흐름) 계산 함수
function calculateDeltaCash(tradeType, settleAmount, tax) {
    const settle = Number(settleAmount) || 0;
    const fee = Number(tax) || 0;

    // [+] 유입: 분배금, 배당금, 이자, 입금, 매도 -> 정산금액 - 세금
    if (['분배금', '배당금', '이자', '입금', '매도'].includes(tradeType)) {
        return settle - fee;
    }
    // [-] 유출: 출금, 매수 -> -(정산금액 + 세금)
    if (['출금', '매수'].includes(tradeType)) {
        return -(settle + fee);
    }
    return 0;
}

// -------------------------------------------------------------
// 1. 신규 거래내역 등록 (POST)
// -------------------------------------------------------------
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

        if (!trade_date || !account_id || !trade_type || !ticker) {
            return new Response(JSON.stringify({ success: false, error: "필수 항목 누락" }), { status: 400 });
        }

        const deltaCash = calculateDeltaCash(trade_type, settle_amount, tax);

        const insertLogStmt = db.prepare(`
            INSERT INTO trade_logs (trade_date, account_id, trade_type, ticker, quantity, unit_price, settle_amount, fee, memo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(trade_date, account_id, trade_type, ticker, Number(quantity) || 0, Number(unit_price) || 0, Number(settle_amount) || 0, Number(tax) || 0, memo || '');

        const updateCashStmt = db.prepare(`
            UPDATE accounts SET cash_balance = cash_balance + ? WHERE account_id = ?
        `).bind(deltaCash, account_id);

        await db.batch([insertLogStmt, updateCashStmt]);

        return new Response(JSON.stringify({ success: true, message: "등록 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}

// -------------------------------------------------------------
// 2. 거래내역 수정 (PUT) - 이전 예수금 롤백 후 새 금액 반영
// -------------------------------------------------------------
export async function onRequestPut(context) {
    const { request, env } = context;

    try {
        const db = env.DB;
        const body = await request.json();
        const { trade_id, trade_date, account_id, trade_type, ticker, quantity = 0, unit_price = 0, settle_amount = 0, tax = 0, memo = '' } = body;

        if (!trade_id) {
            return new Response(JSON.stringify({ success: false, error: "수정할 trade_id가 없습니다." }), { status: 400 });
        }

        if (Number(trade_id) <= BASE_FIXED_TRADE_ID) {
            return new Response(JSON.stringify({ success: false, error: "초기 고정 데이터는 수정할 수 없습니다." }), { status: 403 });
        }

        // 기존 거래내역 조회 (이전 예수금 변동분 롤백용)
        const oldLog = await db.prepare("SELECT * FROM trade_logs WHERE trade_id = ?").bind(trade_id).first();
        if (!oldLog) {
            return new Response(JSON.stringify({ success: false, error: "해당 거래내역을 찾을 수 없습니다." }), { status: 404 });
        }

        const oldDelta = calculateDeltaCash(oldLog.trade_type, oldLog.settle_amount, oldLog.fee);
        const newDelta = calculateDeltaCash(trade_type, settle_amount, tax);

        const statements = [];

        // 이전 계좌 예수금 롤백 (-)
        statements.push(
            db.prepare("UPDATE accounts SET cash_balance = cash_balance - ? WHERE account_id = ?")
              .bind(oldDelta, oldLog.account_id)
        );

        // 변경된 계좌 예수금 반영 (+)
        statements.push(
            db.prepare("UPDATE accounts SET cash_balance = cash_balance + ? WHERE account_id = ?")
              .bind(newDelta, account_id)
        );

        // 원장 기록 수정
        statements.push(
            db.prepare(`
                UPDATE trade_logs 
                SET trade_date = ?, account_id = ?, trade_type = ?, ticker = ?, quantity = ?, unit_price = ?, settle_amount = ?, fee = ?, memo = ?
                WHERE trade_id = ?
            `).bind(trade_date, account_id, trade_type, ticker, Number(quantity) || 0, Number(unit_price) || 0, Number(settle_amount) || 0, Number(tax) || 0, memo || '', trade_id)
        );

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: "수정 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}

// -------------------------------------------------------------
// 3. 거래내역 삭제 (DELETE) - 예수금 원상복구 및 장부 영구 제거
// -------------------------------------------------------------
export async function onRequestDelete(context) {
    const { request, env } = context;

    try {
        const db = env.DB;
        const url = new URL(request.url);
        const trade_id = url.searchParams.get('id');

        if (!trade_id) {
            return new Response(JSON.stringify({ success: false, error: "삭제할 id 파라미터가 없습니다." }), { status: 400 });
        }

        if (Number(trade_id) <= BASE_FIXED_TRADE_ID) {
            return new Response(JSON.stringify({ success: false, error: "초기 고정 데이터는 삭제할 수 없습니다." }), { status: 403 });
        }

        // 삭제 전 기존 내역 확인
        const targetLog = await db.prepare("SELECT * FROM trade_logs WHERE trade_id = ?").bind(trade_id).first();
        if (!targetLog) {
            return new Response(JSON.stringify({ success: false, error: "삭제할 내역이 존재하지 않습니다." }), { status: 404 });
        }

        // 기존에 반영되었던 예수금 변동액 산출
        const appliedDelta = calculateDeltaCash(targetLog.trade_type, targetLog.settle_amount, targetLog.fee);

        // 1) 예수금 원상복구: 적용되었던 금액을 차감하여 복원
        const rollbackCashStmt = db.prepare("UPDATE accounts SET cash_balance = cash_balance - ? WHERE account_id = ?")
                                   .bind(appliedDelta, targetLog.account_id);

        // 2) 장부에서 내역 영구 삭제
        const deleteLogStmt = db.prepare("DELETE FROM trade_logs WHERE trade_id = ?").bind(trade_id);

        await db.batch([rollbackCashStmt, deleteLogStmt]);

        return new Response(JSON.stringify({ success: true, message: "삭제 및 예수금 복구 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}