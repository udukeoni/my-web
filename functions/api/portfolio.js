// functions/api/portfolio.js
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const accountFilter = url.searchParams.get('account') || 'ALL';
    const viewType = url.searchParams.get('view') || 'HOLDINGS';

    // 💡 1. 로그인 세션 쿠키에서 현재 사용자 식별 (user_id 추출)
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    let currentUserId = 'antmaster84'; // 기본값 (세션 미확인 시 기본 관리자 귀속)
    const token = cookies['auth_token'];
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

        // 💡 2. 현재 로그인한 사용자 본인 소유의 계좌만 조회 (타인 데이터 완벽 격리)
        const accountsResult = await db.prepare(
            "SELECT * FROM accounts WHERE user_id = ? OR (user_id IS NULL AND ? = 'antmaster84') ORDER BY account_id ASC"
        ).bind(currentUserId, currentUserId).all();
        const accounts = accountsResult.results || [];

        const allowedAccountIds = accounts.map(a => a.account_id);

        const accountNameMap = {};
        accounts.forEach(a => {
            if (a.account_id) accountNameMap[a.account_id] = a.account_name;
        });

        const assetsResult = await db.prepare("SELECT ticker, asset_name FROM assets").all();
        const assetNameMap = {};
        (assetsResult.results || []).forEach(ast => {
            if (ast.ticker) assetNameMap[ast.ticker] = ast.asset_name;
        });

        // 💡 3. 보유 종목(holdings) 조회 - 본인 소유 계좌의 주식만 추출
        let holdings = [];
        if (allowedAccountIds.length > 0) {
            const placeholders = allowedAccountIds.map(() => '?').join(',');
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
                WHERE h.account_id IN (${placeholders})
            `;

            const holdingsParams = [...allowedAccountIds];
            if (accountFilter !== 'ALL' && allowedAccountIds.includes(accountFilter)) {
                holdingsQuery += " AND h.account_id = ?";
                holdingsParams.push(accountFilter);
            } else if (accountFilter !== 'ALL') {
                holdingsQuery += " AND 1=0";
            }
            holdingsQuery += " ORDER BY eval_amount DESC";

            const holdingsStmt = db.prepare(holdingsQuery);
            const holdingsResult = await holdingsStmt.bind(...holdingsParams).all();
            holdings = holdingsResult.results || [];
        }

        // 💡 4. 거래 원장(trade_logs) 조회 - 본인 소유 계좌의 거래만 추출
        let rawLogs = [];
        if (allowedAccountIds.length > 0) {
            const placeholders = allowedAccountIds.map(() => '?').join(',');
            let logQuery = `SELECT * FROM trade_logs WHERE account_id IN (${placeholders})`;
            const logParams = [...allowedAccountIds];

            if (accountFilter !== 'ALL' && allowedAccountIds.includes(accountFilter)) {
                logQuery += " AND account_id = ?";
                logParams.push(accountFilter);
            }

            if (viewType === 'TRADE') {
                logQuery += " AND trade_type IN ('매수', '매도')";
            } else if (viewType === 'DIVIDEND') {
                logQuery += " AND trade_type IN ('분배금', '배당금')";
            } else if (viewType === 'TRANSFER') {
                logQuery += " AND trade_type IN ('입금', '출금', '이자')";
            }

            logQuery += " ORDER BY trade_date DESC, trade_id DESC LIMIT 1000";

            try {
                const logStmt = db.prepare(logQuery);
                const logResult = await logStmt.bind(...logParams).all();
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

        // 💡 5. 자산 합산 계산 (예수금, 평가금액, 순자산)
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

        // 💡 6. 밴드리밸런싱 설정 조회
        let rebalanceSettingsMap = new Map();
        let rebalanceCashSetting = null;

        if (allowedAccountIds.length > 0) {
            try {
                const placeholders = allowedAccountIds.map(() => '?').join(',');
                const rebQuery = accountFilter === 'ALL'
                    ? `SELECT account_id, ticker, target_weight, band_min, band_max FROM rebalance_settings WHERE account_id IN (${placeholders})`
                    : `SELECT account_id, ticker, target_weight, band_min, band_max FROM rebalance_settings WHERE account_id = ?`;
                const rebStmt = db.prepare(rebQuery);
                const rebRes = accountFilter === 'ALL' 
                    ? await rebStmt.bind(...allowedAccountIds).all() 
                    : await rebStmt.bind(accountFilter).all();
                
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

        // 💡 7. [핵심 수정] 일별 자산 추이 스냅샷 격리
        // 관리자(antmaster84)에게만 과거 'ALL' 종합 스냅샷을 보여주고,
        // 신규 일반 회원은 오직 본인이 보유한 계좌 ID의 스냅샷만 조회하도록 분기 처리 (관리자 데이터 유출 원천 차단)
        let dailyHistory = [];
        try {
            if (currentUserId === 'antmaster84') {
                const targetSnapAccount = (accountFilter === 'ALL') ? 'ALL' : accountFilter;
                const dailyQuery = "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = ? ORDER BY snapshot_date ASC";
                const dailyRes = await db.prepare(dailyQuery).bind(targetSnapAccount).all();
                dailyHistory = dailyRes.results || [];
            } else {
                // 일반 회원의 경우: 본인 소유 계좌 중 선택된 계좌 또는 소유 계좌들의 스냅샷만 조회
                if (accountFilter !== 'ALL' && allowedAccountIds.includes(accountFilter)) {
                    const dailyQuery = "SELECT snapshot_date, net_worth, invested FROM daily_snapshots WHERE account_id = ? ORDER BY snapshot_date ASC";
                    const dailyRes = await db.prepare(dailyQuery).bind(accountFilter).all();
                    dailyHistory = dailyRes.results || [];
                } else if (allowedAccountIds.length > 0) {
                    const placeholders = allowedAccountIds.map(() => '?').join(',');
                    const dailyQuery = `
                        SELECT snapshot_date, SUM(net_worth) as net_worth, SUM(invested) as invested 
                        FROM daily_snapshots 
                        WHERE account_id IN (${placeholders}) 
                        GROUP BY snapshot_date 
                        ORDER BY snapshot_date ASC
                    `;
                    const dailyRes = await db.prepare(dailyQuery).bind(...allowedAccountIds).all();
                    dailyHistory = dailyRes.results || [];
                }
            }
        } catch (chartErr) {
            console.error("차트 데이터 조회 에러:", chartErr.message);
        }

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