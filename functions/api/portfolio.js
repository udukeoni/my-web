// functions/api/portfolio.js
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const accountFilter = url.searchParams.get('account') || 'ALL';
    const viewType = url.searchParams.get('view') || 'HOLDINGS';

    // 1. 세션 쿠키에서 현재 로그인한 사용자(user_id) 식별
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];
    let currentUserId = 'antmaster84'; // 기본값 (세션 미존재 시 관리자 기본)
    if (token) {
        try {
            const decoded = decodeURIComponent(escape(atob(token)));
            const session = JSON.parse(decoded);
            if (session && session.user_id) {
                currentUserId = session.user_id;
            }
        } catch (_) {}
    }

    try {
        const db = env.DB;

        // 2. 계정주(user_id)에 귀속된 본인 계좌 목록만 조회 (사용자별 완벽 격리)
        const accountsResult = await db.prepare(
            "SELECT * FROM accounts WHERE user_id = ? OR (user_id IS NULL AND ? = 'antmaster84') ORDER BY account_id ASC"
        ).bind(currentUserId, currentUserId).all();
        const accounts = accountsResult.results || [];

        const myAccountIds = accounts.map(a => a.account_id);
        const accountNameMap = {};
        accounts.forEach(a => {
            if (a.account_id) accountNameMap[a.account_id] = a.account_name;
        });

        // 3. 종목 마스터 조회
        const assetsResult = await db.prepare("SELECT ticker, asset_name FROM assets").all();
        const assetNameMap = {};
        (assetsResult.results || []).forEach(ast => {
            if (ast.ticker) assetNameMap[ast.ticker] = ast.asset_name;
        });

        // 4. 본인 계좌의 보유 종목 잔고만 조회
        let holdings = [];
        if (myAccountIds.length > 0) {
            let holdingsQuery = `
                SELECT 
                    h.holding_id,
                    h.account_id,
                    ac.account_name,
                    h.ticker,
                    a.asset_name,
                    a.sector,
                    h.quantity,
                    CASE 
                        WHEN h.quantity > 0 AND h.total_buy_amount > 0 THEN (h.total_buy_amount * 1.0 / h.quantity)
                        ELSE h.avg_buy_price 
                    END AS avg_buy_price,
                    a.current_price,
                    0 AS daily_change_rate,
                    CASE 
                        WHEN h.total_buy_amount > 0 THEN h.total_buy_amount 
                        ELSE ROUND(h.quantity * h.avg_buy_price) 
                    END AS buy_amount,
                    ROUND(h.quantity * a.current_price) AS eval_amount,
                    ROUND(h.quantity * a.current_price) - (
                        CASE 
                            WHEN h.total_buy_amount > 0 THEN h.total_buy_amount 
                            ELSE ROUND(h.quantity * h.avg_buy_price) 
                        END
                    ) AS profit_amount,
                    ROUND(
                        (
                            (h.quantity * a.current_price) - (
                                CASE 
                                    WHEN h.total_buy_amount > 0 THEN h.total_buy_amount 
                                    ELSE (h.quantity * h.avg_buy_price) 
                                END
                            )
                        ) * 100.0 / (
                            CASE 
                                WHEN h.total_buy_amount > 0 THEN h.total_buy_amount 
                                ELSE (h.quantity * h.avg_buy_price) 
                            END
                        ), 2
                    ) AS profit_rate
                FROM holdings h
                JOIN accounts ac ON h.account_id = ac.account_id
                JOIN assets a ON h.ticker = a.ticker
            `;

            const holdingsConditions = [];
            const holdingsParams = [];

            if (accountFilter === 'ALL') {
                const placeholders = myAccountIds.map(() => '?').join(',');
                holdingsConditions.push(`h.account_id IN (${placeholders})`);
                holdingsParams.push(...myAccountIds);
            } else {
                if (myAccountIds.includes(accountFilter)) {
                    holdingsConditions.push("h.account_id = ?");
                    holdingsParams.push(accountFilter);
                } else {
                    holdingsConditions.push("1 = 0");
                }
            }

            if (holdingsConditions.length > 0) {
                holdingsQuery += " WHERE " + holdingsConditions.join(" AND ");
            }
            holdingsQuery += " ORDER BY eval_amount DESC";

            const holdingsStmt = db.prepare(holdingsQuery);
            const holdingsResult = holdingsParams.length > 0 
                ? await holdingsStmt.bind(...holdingsParams).all() 
                : await holdingsStmt.all();
            holdings = holdingsResult.results || [];
        }

        // 5. 본인 계좌의 거래 원장 장부만 조회
        let rawLogs = [];
        if (myAccountIds.length > 0) {
            let logQuery = "SELECT * FROM trade_logs";
            const logConditions = [];
            const logParams = [];

            if (accountFilter === 'ALL') {
                const placeholders = myAccountIds.map(() => '?').join(',');
                logConditions.push(`account_id IN (${placeholders})`);
                logParams.push(...myAccountIds);
            } else {
                if (myAccountIds.includes(accountFilter)) {
                    logConditions.push("account_id = ?");
                    logParams.push(accountFilter);
                } else {
                    logConditions.push("1 = 0");
                }
            }

            if (viewType === 'TRADE') {
                logConditions.push("trade_type IN ('매수', '매도')");
            } else if (viewType === 'DIVIDEND') {
                logConditions.push("trade_type IN ('분배금', '배당금')");
            } else if (viewType === 'TRANSFER') {
                logConditions.push("trade_type IN ('입금', '출금', '이자')");
            }

            if (logConditions.length > 0) {
                logQuery += " WHERE " + logConditions.join(" AND ");
            }
            logQuery += " ORDER BY trade_date DESC, trade_id DESC LIMIT 1000";

            try {
                const logStmt = db.prepare(logQuery);
                const logResult = logParams.length > 0 
                    ? await logStmt.bind(...logParams).all() 
                    : await logStmt.all();
                rawLogs = logResult.results || [];
            } catch (logErr) {
                console.error("trade_logs 조회 예외:", logErr.message);
                rawLogs = [];
            }
        }

        const logs = rawLogs.map(item => {
            const accName = accountNameMap[item.account_id] || item.account_id || '계좌';
            let displayAssetName = assetNameMap[item.ticker] || item.ticker || '-';

            if (item.ticker === 'CASH') {
                displayAssetName = '원화 현금';
            } else if (item.trade_type === '이자') {
                displayAssetName = `${accName} 이자`;
            }

            return {
                ...item,
                account_name: accName,
                display_asset_name: displayAssetName
            };
        });

        // 6. 요약 금액 산출 (선택된 계좌 기준)
        let targetCash = 0;
        if (accountFilter === 'ALL') {
            targetCash = accounts.reduce((acc, cur) => acc + (cur.cash_balance || 0), 0);
        } else {
            const foundAcc = accounts.find(a => a.account_id === accountFilter);
            targetCash = foundAcc ? (foundAcc.cash_balance || 0) : 0;
        }

        const totalStockEval = Math.round(holdings.reduce((acc, cur) => acc + (cur.eval_amount || 0), 0));
        const totalInvested = Math.round(holdings.reduce((acc, cur) => acc + (cur.buy_amount || 0), 0));
        const totalProfit = totalStockEval - totalInvested;
        const netWorth = totalStockEval + targetCash;

        const stockProfitRate = totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0;
        const totalAssetInvested = totalInvested + targetCash;
        const netProfitRate = totalAssetInvested > 0 ? Number(((totalProfit / totalAssetInvested) * 100).toFixed(2)) : 0;
        const cashWeight = netWorth > 0 ? Number(((targetCash / netWorth) * 100).toFixed(1)) : 0;

        // 7. 리밸런싱 설정 조회
        let rebalanceSettingsMap = new Map();
        let rebalanceCashSetting = null;

        if (myAccountIds.length > 0) {
            try {
                let rebQuery = "SELECT account_id, ticker, target_weight, band_min, band_max FROM rebalance_settings";
                const rebParams = [];
                if (accountFilter === 'ALL') {
                    const placeholders = myAccountIds.map(() => '?').join(',');
                    rebQuery += ` WHERE account_id IN (${placeholders})`;
                    rebParams.push(...myAccountIds);
                } else {
                    rebQuery += " WHERE account_id = ?";
                    rebParams.push(accountFilter);
                }

                const rebStmt = db.prepare(rebQuery);
                const rebRes = rebParams.length > 0 ? await rebStmt.bind(...rebParams).all() : await rebStmt.all();
                
                (rebRes.results || []).forEach(r => {
                    rebalanceSettingsMap.set(`${r.account_id}_${r.ticker}`, r);
                    if (r.ticker === 'CASH') {
                        const cTarget = Number(r.target_weight);
                        rebalanceCashSetting = {
                            ...r,
                            band_min: Number((cTarget * 0.8).toFixed(2)),
                            band_max: Number((cTarget * 1.2).toFixed(2))
                        };
                    }
                });
            } catch (rebErr) {
                console.error("리밸런싱 설정 조회 예외:", rebErr.message);
            }
        }

        const holdingsWithWeight = holdings.map(item => {
            const currentEval = item.eval_amount || 0;
            const currentWeight = netWorth > 0 ? Number(((currentEval / netWorth) * 100).toFixed(2)) : 0;

            const settingKey = `${item.account_id}_${item.ticker}`;
            const setting = rebalanceSettingsMap.get(settingKey);

            let targetWeight = null;
            let bandMin = null;
            let bandMax = null;
            let status = '미설정';
            let diffAmount = 0;
            let adjustShares = 0;

            if (setting) {
                targetWeight = Number(setting.target_weight);
                bandMin = Number((targetWeight * 0.8).toFixed(2));
                bandMax = Number((targetWeight * 1.2).toFixed(2));

                if (currentWeight < bandMin) {
                    status = '매수';
                } else if (currentWeight > bandMax) {
                    status = '매도';
                } else {
                    status = '유지';
                }

                const targetEval = netWorth * (targetWeight / 100);
                diffAmount = Math.round(targetEval - currentEval);

                if (item.current_price > 0) {
                    adjustShares = Math.round(diffAmount / item.current_price);
                }
            }

            return {
                ...item,
                weight: currentWeight,
                target_weight: targetWeight,
                band_min: bandMin,
                band_max: bandMax,
                rebalance_status: status,
                diff_amount: diffAmount,
                adjust_shares: adjustShares
            };
        });

        // 8. 차트 스냅샷 데이터 계정주(user_id) 완전 격리 조회 ({currentUserId}_ALL 표준 적용)
        let dailyHistory = [];
        try {
            if (accountFilter === 'ALL') {
                // 관리자와 일반 회원 모두 예외 없이 {currentUserId}_ALL 단일 키로만 조회
                const userTotalKey = `${currentUserId}_ALL`;
                const dailyStmt = db.prepare(
                    "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = ? ORDER BY snapshot_date ASC"
                ).bind(userTotalKey);
                const dailyRes = await dailyStmt.all();
                dailyHistory = dailyRes.results || [];
            } else {
                // 개별 계좌 조회 시 본인 소유 계좌만 조회
                if (myAccountIds.includes(accountFilter)) {
                    const dailyStmt = db.prepare(
                        "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = ? ORDER BY snapshot_date ASC"
                    ).bind(accountFilter);
                    const dailyRes = await dailyStmt.all();
                    dailyHistory = dailyRes.results || [];
                }
            }
        } catch (chartErr) {
            console.error("차트 데이터 조회 에러:", chartErr.message);
        }

        // 9. 동기화 서버 시각 추출
        let serverSyncTime = null;
        try {
            const snapshotTimeRes = await db.prepare(
                "SELECT updated_at FROM daily_snapshots WHERE updated_at IS NOT NULL ORDER BY snapshot_date DESC, updated_at DESC LIMIT 1"
            ).first();
            
            if (snapshotTimeRes && snapshotTimeRes.updated_at) {
                serverSyncTime = snapshotTimeRes.updated_at;
            }
        } catch (_) {}

        return new Response(JSON.stringify({
            success: true,
            accountFilter,
            viewType,
            currentUser: currentUserId,
            lastSyncTime: serverSyncTime,
            summary: {
                netWorth,
                totalStockEval,
                cashBalance: targetCash,
                invested: totalInvested,
                profitAmount: totalProfit,
                stockProfitRate,
                netProfitRate,
                cashWeight,
                lastUpdated: serverSyncTime
            },
            accounts,
            holdings: holdingsWithWeight,
            rebalanceCashSetting,
            logs,
            chartData: {
                daily: dailyHistory
            }
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}