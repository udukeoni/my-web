// functions/api/trend-history.js
// 상세 자산 변동 장부 조회 전용 (1W / 1M / 3M / ALL - 일간 스냅샷 기반)

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const period = url.searchParams.get('period') || '1W';
    const accountFilter = url.searchParams.get('account') || 'ALL';

    try {
        const db = env.DB;

        // 1. 전체 계좌 목록 및 한글명 맵핑
        const accountsResult = await db.prepare("SELECT account_id, account_name FROM accounts ORDER BY account_id ASC").all();
        const accounts = accountsResult.results || [];
        const accountNameMap = { 'ALL': '전체 계좌 종합' };
        accounts.forEach(a => {
            accountNameMap[a.account_id] = a.account_name;
        });

        // 2. daily_snapshots 기반 기간별 조건 분기
        let query = `
            SELECT snapshot_date as time_label, account_id, net_worth, invested 
            FROM daily_snapshots 
        `;
        const conditions = [];
        const params = [];

        if (accountFilter !== 'ALL') {
            conditions.push("account_id = ?");
            params.push(accountFilter);
        }

        if (period === '1W') {
            // 최근 7일 이내
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            conditions.push("snapshot_date >= ?");
            params.push(cutoff);
        } else if (period === '1M') {
            // 최근 30일 이내
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            conditions.push("snapshot_date >= ?");
            params.push(cutoff);
        } else if (period === '3M') {
            // 최근 90일 이내
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            conditions.push("snapshot_date >= ?");
            params.push(cutoff);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }
        query += " ORDER BY snapshot_date DESC, account_id ASC";

        const stmt = db.prepare(query);
        const res = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
        const rows = res.results || [];

        // 3. 손익금 및 수익률 계산 매핑
        const formattedList = rows.map(item => {
            const profit = (item.net_worth || 0) - (item.invested || 0);
            const profitRate = item.invested > 0 ? Number(((profit / item.invested) * 100).toFixed(2)) : 0;
            return {
                ...item,
                account_name: accountNameMap[item.account_id] || item.account_id,
                profit_amount: profit,
                profit_rate: profitRate
            };
        });

        return new Response(JSON.stringify({
            success: true,
            period,
            accountFilter,
            count: formattedList.length,
            data: formattedList
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}