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

/**
 * 종목 잔고(holdings) 업데이트 로직
 * @param {object} db D1
 * @param {string} accountId 계좌ID
 * @param {string} ticker 종목코드
 * @param {string} tradeType 거래구분
 * @param {number} qty 수량
 * @param {number} settleAmount 정산금액
 * @param {number} fee 세금/수수료
 * @param {boolean} isRollback 역산 여부 (삭제나 수정 시 이전 데이터 효과 제거용)
 */
async function updateHoldingBalance(db, accountId, ticker, tradeType, qty, settleAmount, fee, isRollback = false) {
    // 현금성 자산이나 이자는 holdings 테이블 관리 대상이 아님
    if (['CASH', 'INTEREST'].includes(ticker)) return null;
    if (!['매수', '매도'].includes(tradeType)) return null;

    const q = Number(qty) || 0;
    const settle = Number(settleAmount) || 0;
    const tax = Number(fee) || 0;
    const cost = settle + tax; // 매수 시 투입된 총 원금

    // 1. 현재 잔고 확인
    const current = await db.prepare("SELECT * FROM holdings WHERE account_id = ? AND ticker = ?")
        .bind(accountId, ticker)
        .first();

    // 매수 거래 (Rollback이 아니면 추가, Rollback이면 차감)
    if (tradeType === '매수') {
        const factor = isRollback ? -1 : 1;
        const finalQty = (current ? current.quantity : 0) + (q * factor);
        const finalTotalBuy = (current ? current.total_buy_amount : 0) + (cost * factor);
        
        if (finalQty <= 0) {
            return db.prepare("DELETE FROM holdings WHERE account_id = ? AND ticker = ?").bind(accountId, ticker);
        }

        const finalAvgPrice = Math.round(finalTotalBuy / finalQty);

        if (!current) {
            return db.prepare("INSERT INTO holdings (account_id, ticker, quantity, total_buy_amount, avg_buy_price) VALUES (?, ?, ?, ?, ?)")
                .bind(accountId, ticker, finalQty, finalTotalBuy, finalAvgPrice);
        } else {
            return db.prepare("UPDATE holdings SET quantity = ?, total_buy_amount = ?, avg_buy_price = ? WHERE account_id = ? AND ticker = ?")
                .bind(finalQty, finalTotalBuy, finalAvgPrice, accountId, ticker);
        }
    }

    // 매도 거래 (Rollback이 아니면 차감, Rollback이면 추가)
    if (tradeType === '매도') {
        if (!current && !isRollback) return null; // 잔고 없는데 매도는 이론상 불가

        const factor = isRollback ? 1 : -1;
        
        // 매도 시에는 '평균단가'는 유지하고, 수량과 그에 비례하는 '매입원금'만 차감함
        // Rollback 시에는 반대로 수량과 원금을 다시 더해줌
        const currentAvgPrice = current ? (current.total_buy_amount / current.quantity) : 0;
        const costBasisOfSold = Math.round(currentAvgPrice * q);

        const finalQty = (current ? current.quantity : 0) + (q * factor);
        const finalTotalBuy = (current ? current.total_buy_amount : 0) + (costBasisOfSold * factor);

        if (finalQty <= 0 && !isRollback) {
            return db.prepare("DELETE FROM holdings WHERE account_id = ? AND ticker = ?").bind(accountId, ticker);
        }

        const finalAvgPrice = finalQty > 0 ? Math.round(finalTotalBuy / finalQty) : (current ? current.avg_buy_price : 0);

        if (!current && isRollback) {
            // 삭제(Rollback)했는데 잔고가 아예 없었다면 새로 생성
            return db.prepare("INSERT INTO holdings (account_id, ticker, quantity, total_buy_amount, avg_buy_price) VALUES (?, ?, ?, ?, ?)")
                .bind(accountId, ticker, finalQty, finalTotalBuy, finalAvgPrice);
        }

        return db.prepare("UPDATE holdings SET quantity = ?, total_buy_amount = ?, avg_buy_price = ? WHERE account_id = ? AND ticker = ?")
            .bind(finalQty, finalTotalBuy, finalAvgPrice, accountId, ticker);
    }

    return null;
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
        const statements = [];

        // 1) 거래 로그 기록
        statements.push(db.prepare(`
            INSERT INTO trade_logs (trade_date, account_id, trade_type, ticker, quantity, unit_price, settle_amount, fee, memo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(trade_date, account_id, trade_type, ticker, Number(quantity) || 0, Number(unit_price) || 0, Number(settle_amount) || 0, Number(tax) || 0, memo || ''));

        // 2) 계좌 예수금 반영
        statements.push(db.prepare(`
            UPDATE accounts SET cash_balance = cash_balance + ? WHERE account_id = ?
        `).bind(deltaCash, account_id));

        // 3) 종목 잔고(holdings) 반영
        const holdingStmt = await updateHoldingBalance(db, account_id, ticker, trade_type, quantity, settle_amount, tax, false);
        if (holdingStmt) statements.push(holdingStmt);

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: "등록 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}

// -------------------------------------------------------------
// 2. 거래내역 수정 (PUT) - 이전 효과 롤백 후 새 데이터 반영
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

        const oldLog = await db.prepare("SELECT * FROM trade_logs WHERE trade_id = ?").bind(trade_id).first();
        if (!oldLog) {
            return new Response(JSON.stringify({ success: false, error: "해당 거래내역을 찾을 수 없습니다." }), { status: 404 });
        }

        const statements = [];

        // --- [STEP 1] 이전 데이터 효과 제거 (Rollback) ---
        const oldDelta = calculateDeltaCash(oldLog.trade_type, oldLog.settle_amount, oldLog.fee);
        statements.push(db.prepare("UPDATE accounts SET cash_balance = cash_balance - ? WHERE account_id = ?")
            .bind(oldDelta, oldLog.account_id));

        const rollbackHolding = await updateHoldingBalance(db, oldLog.account_id, oldLog.ticker, oldLog.trade_type, oldLog.quantity, oldLog.settle_amount, oldLog.fee, true);
        if (rollbackHolding) statements.push(rollbackHolding);

        // --- [STEP 2] 새로운 데이터 효과 반영 ---
        const newDelta = calculateDeltaCash(trade_type, settle_amount, tax);
        statements.push(db.prepare("UPDATE accounts SET cash_balance = cash_balance + ? WHERE account_id = ?")
            .bind(newDelta, account_id));

        const applyHolding = await updateHoldingBalance(db, account_id, ticker, trade_type, quantity, settle_amount, tax, false);
        if (applyHolding) statements.push(applyHolding);

        // --- [STEP 3] 로그 수정 ---
        statements.push(db.prepare(`
            UPDATE trade_logs 
            SET trade_date = ?, account_id = ?, trade_type = ?, ticker = ?, quantity = ?, unit_price = ?, settle_amount = ?, fee = ?, memo = ?
            WHERE trade_id = ?
        `).bind(trade_date, account_id, trade_type, ticker, Number(quantity) || 0, Number(unit_price) || 0, Number(settle_amount) || 0, Number(tax) || 0, memo || '', trade_id));

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: "수정 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}

// -------------------------------------------------------------
// 3. 거래내역 삭제 (DELETE)
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

        const targetLog = await db.prepare("SELECT * FROM trade_logs WHERE trade_id = ?").bind(trade_id).first();
        if (!targetLog) {
            return new Response(JSON.stringify({ success: false, error: "삭제할 내역이 존재하지 않습니다." }), { status: 404 });
        }

        const statements = [];

        // 1) 예수금 원상복구
        const appliedDelta = calculateDeltaCash(targetLog.trade_type, targetLog.settle_amount, targetLog.fee);
        statements.push(db.prepare("UPDATE accounts SET cash_balance = cash_balance - ? WHERE account_id = ?")
            .bind(appliedDelta, targetLog.account_id));

        // 2) 종목 잔고 원상복구 (Rollback)
        const rollbackHolding = await updateHoldingBalance(db, targetLog.account_id, targetLog.ticker, targetLog.trade_type, targetLog.quantity, targetLog.settle_amount, targetLog.fee, true);
        if (rollbackHolding) statements.push(rollbackHolding);

        // 3) 로그 삭제
        statements.push(db.prepare("DELETE FROM trade_logs WHERE trade_id = ?").bind(trade_id));

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: "삭제 완료" }), {
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
}