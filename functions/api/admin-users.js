// functions/api/admin-users.js
export async function onRequestGet(context) {
    const { request, env } = context;

    // 1. 세션 쿠키에서 사용자 식별 및 관리자 권한 검증
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];
    if (!token) {
        return new Response(JSON.stringify({ success: false, error: '인증 세션이 없습니다. 로그인해 주세요.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    let session = null;
    try {
        const decoded = decodeURIComponent(escape(atob(token)));
        session = JSON.parse(decoded);
    } catch (_) {
        return new Response(JSON.stringify({ success: false, error: '세션 정보가 올바르지 않습니다.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    // 관리자(ADMIN) 권한 또는 antmaster84 계정만 접근 허용
    if (!session || (session.role !== 'ADMIN' && session.user_id !== 'antmaster84')) {
        return new Response(JSON.stringify({ success: false, error: '접근 권한이 없습니다. 관리자만 조회 가능합니다.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const db = env.DB;

        // 2. 가입된 회원 목록 조회 (비밀번호 해시는 보안상 제외)
        const usersResult = await db.prepare(`
            SELECT user_no, user_id, nickname, role, status, created_at
            FROM users
            ORDER BY user_no ASC
        `).all();
        const users = usersResult.results || [];

        // 3. 회원별 개설 계좌 수 및 총 잔고 집계
        const accountsResult = await db.prepare(`
            SELECT user_id, COUNT(account_id) as acc_count, SUM(cash_balance) as total_cash
            FROM accounts
            GROUP BY user_id
        `).all();
        const accMap = {};
        (accountsResult.results || []).forEach(row => {
            if (row.user_id) accMap[row.user_id] = row;
        });

        const enrichedUsers = users.map(u => ({
            ...u,
            account_count: accMap[u.user_id] ? accMap[u.user_id].acc_count : 0,
            cash_total: accMap[u.user_id] ? (accMap[u.user_id].total_cash || 0) : 0
        }));

        // 4. 최근 로그인 감사 로그 최신 50건 조회
        const logsResult = await db.prepare(`
            SELECT log_id, user_id, ip_address, user_agent, login_status, attempt_time
            FROM login_logs
            ORDER BY log_id DESC
            LIMIT 50
        `).all();
        const loginLogs = logsResult.results || [];

        return new Response(JSON.stringify({
            success: true,
            currentUser: session.user_id,
            users: enrichedUsers,
            loginLogs
        }), {
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Cache-Control': 'no-cache'
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'DB 조회 실패: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}