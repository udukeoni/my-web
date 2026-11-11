// functions/api/admin-users.js

// 비밀번호 SHA-256 암호화 함수
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 관리자 세션 권한 검증 공통 함수
function verifyAdminSession(request) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];
    if (!token) return { valid: false, error: '인증 세션이 없습니다. 로그인해 주세요.', status: 401 };

    try {
        const decoded = decodeURIComponent(escape(atob(token)));
        const session = JSON.parse(decoded);
        if (!session || (session.role !== 'ADMIN' && session.user_id !== 'antmaster84')) {
            return { valid: false, error: '접근 권한이 없습니다. 관리자 전용 기능입니다.', status: 403 };
        }
        return { valid: true, session };
    } catch (_) {
        return { valid: false, error: '세션 정보가 올바르지 않습니다.', status: 401 };
    }
}

// 1. 회원 목록 및 감사 로그 조회 (GET)
export async function onRequestGet(context) {
    const { request, env } = context;
    const auth = verifyAdminSession(request);
    if (!auth.valid) {
        return new Response(JSON.stringify({ success: false, error: auth.error }), {
            status: auth.status,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const db = env.DB;

        const usersResult = await db.prepare(`
            SELECT user_no, user_id, nickname, role, status, created_at
            FROM users
            ORDER BY user_no ASC
        `).all();
        const users = usersResult.results || [];

        const accountsResult = await db.prepare(`
            SELECT user_id, COUNT(account_id) as acc_count, SUM(cash_balance) as total_cash
            FROM accounts
            GROUP BY user_id
        `).all();
        const accMap = {};
        (accountsResult.results || []).forEach(row => {
            if (row.user_id) accMap[row.user_id.toLowerCase()] = row;
        });

        const enrichedUsers = users.map(u => {
            const lowId = (u.user_id || '').toLowerCase();
            return {
                ...u,
                account_count: accMap[lowId] ? accMap[lowId].acc_count : 0,
                cash_total: accMap[lowId] ? (accMap[lowId].total_cash || 0) : 0
            };
        });

        const logsResult = await db.prepare(`
            SELECT log_id, user_id, ip_address, user_agent, login_status, attempt_time
            FROM login_logs
            ORDER BY log_id DESC            
        `).all();

        return new Response(JSON.stringify({
            success: true,
            currentUser: auth.session.user_id,
            users: enrichedUsers,
            loginLogs: logsResult.results || []
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'DB 조회 실패: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}

// 2. 회원 정보 수정 및 상태 변경(정지/해제) (PUT)
export async function onRequestPut(context) {
    const { request, env } = context;
    const auth = verifyAdminSession(request);
    if (!auth.valid) {
        return new Response(JSON.stringify({ success: false, error: auth.error }), {
            status: auth.status,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const db = env.DB;
        const body = await request.json();
        const { user_id, nickname, password, status } = body;

        if (!user_id) {
            return new Response(JSON.stringify({ success: false, error: '수정할 사용자 ID가 누락되었습니다.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        // 대상 회원 존재 확인
        const targetUser = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(user_id).first();
        if (!targetUser) {
            return new Response(JSON.stringify({ success: false, error: '존재하지 않는 회원입니다.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        // 최고 관리자 계정(antmaster84)은 정지 방지 보호
        if (targetUser.user_id === 'antmaster84' && status === 'BLOCKED') {
            return new Response(JSON.stringify({ success: false, error: '최고 관리자 계정은 정지할 수 없습니다.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        const updates = [];
        const params = [];

        if (nickname !== undefined && nickname !== null) {
            updates.push("nickname = ?");
            params.push(String(nickname).trim() || targetUser.user_id);
        }

        if (status && (status === 'ACTIVE' || status === 'BLOCKED')) {
            updates.push("status = ?");
            params.push(status);
        }

        if (password && String(password).trim().length > 0) {
            const hashed = await hashPassword(String(password).trim());
            updates.push("password_hash = ?");
            params.push(hashed);
        }

        if (updates.length === 0) {
            return new Response(JSON.stringify({ success: false, error: '변경할 정보가 없습니다.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        params.push(user_id);
        const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
        await db.prepare(updateQuery).bind(...params).run();

        return new Response(JSON.stringify({
            success: true,
            message: `[${user_id}] 회원 정보가 성공적으로 수정되었습니다.`
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '수정 실패: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}

// 3. 회원 계정 및 연관 데이터 영구 삭제 (DELETE)
export async function onRequestDelete(context) {
    const { request, env } = context;
    const auth = verifyAdminSession(request);
    if (!auth.valid) {
        return new Response(JSON.stringify({ success: false, error: auth.error }), {
            status: auth.status,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const db = env.DB;
        const url = new URL(request.url);
        const targetUserId = url.searchParams.get('user_id');

        if (!targetUserId) {
            return new Response(JSON.stringify({ success: false, error: '삭제할 user_id 파라미터가 없습니다.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        // 최고 관리자 계정 삭제 방지 보호
        if (targetUserId === 'antmaster84') {
            return new Response(JSON.stringify({ success: false, error: '최고 관리자 계정(antmaster84)은 삭제할 수 없습니다.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        // 해당 사용자의 계좌 목록 조회
        const userAccounts = await db.prepare("SELECT account_id FROM accounts WHERE user_id = ?").bind(targetUserId).all();
        const accIds = (userAccounts.results || []).map(a => a.account_id);

        const statements = [];

        // 연쇄 삭제 처리 (종목 잔고, 거래 원장, 스냅샷, 계좌)
        if (accIds.length > 0) {
            const placeholders = accIds.map(() => '?').join(',');
            statements.push(db.prepare(`DELETE FROM holdings WHERE account_id IN (${placeholders})`).bind(...accIds));
            statements.push(db.prepare(`DELETE FROM trade_logs WHERE account_id IN (${placeholders})`).bind(...accIds));
            statements.push(db.prepare(`DELETE FROM daily_snapshots WHERE account_id IN (${placeholders})`).bind(...accIds));
        }

        // 종합 스냅샷({USER_ID}_ALL) 삭제
        statements.push(db.prepare("DELETE FROM daily_snapshots WHERE account_id IN (?, ?)").bind(`${targetUserId.toUpperCase()}_ALL`, `${targetUserId.toLowerCase()}_ALL`));
        statements.push(db.prepare("DELETE FROM accounts WHERE user_id = ?").bind(targetUserId));
        statements.push(db.prepare("DELETE FROM users WHERE user_id = ?").bind(targetUserId));

        await db.batch(statements);

        return new Response(JSON.stringify({
            success: true,
            message: `[${targetUserId}] 회원 및 연관 데이터가 성공적으로 영구 삭제되었습니다.`
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '삭제 실패: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}