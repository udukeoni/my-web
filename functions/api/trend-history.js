// functions/api/trend-history.js
// 상세 자산 변동 장부 조회 전용 (1W / 1M / 3M / ALL - 일간 스냅샷 기반)

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const period = url.searchParams.get('period') || '1W';
    const accountFilter = url.searchParams.get('account') || 'ALL';

    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );
    let sessionUser = 'antmaster84';
    if (cookies['auth_token']) {
        try {
            const decoded = decodeURIComponent(escape(atob(cookies['auth_token'])));
            const s = JSON.parse(decoded);
            if (s && s.user_id) sessionUser = s.user_id;
        } catch (_) {}
    }

    try {
        const db = env.DB;

        // 1. 전체 계좌 목록 및 한글명 맵핑
        const accountsResult = await db.prepare("SELECT account_id, account_name FROM accounts WHERE user_id = ? ORDER BY account_id ASC").bind(sessionUser).all();
        const accounts = accountsResult.results || [];
        const accountNameMap = { 'ALL': '전체 계좌 종합' };
        accounts.forEach(a => {
            accountNameMap[a.account_id] = a.account_name;
        });

        // 2. 전체 계좌 종합 조회 시 {sessionUser}_ALL 단일 표준 키 적용
        let targetKey = accountFilter;
        if (accountFilter === 'ALL') {
            targetKey = `${sessionUser}_ALL`;
        }

        let query = `
            SELECT snapshot_date as time_label, account_id, net_worth, invested 
            FROM daily_snapshots 
            WHERE account_id = ?
        `;
        const params = [targetKey];

        if (period === '1W') {
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query += " AND snapshot_date >= ?";
            params.push(cutoff);
        } else if (period === '1M') {
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query += " AND snapshot_date >= ?";
            params.push(cutoff);
        } else if (period === '3M') {
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query += " AND snapshot_date >= ?";
            params.push(cutoff);
        }

        query += " ORDER BY snapshot_date DESC";

        const stmt = db.prepare(query);
        const res = await stmt.bind(...params).all();
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