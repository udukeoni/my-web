// functions/api/auth.js
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';

    try {
        const db = env.DB;
        const { user_id, password } = await request.json();

        const idRegex = /^[a-zA-Z0-9]{4,16}$/;
        if (!user_id || !idRegex.test(user_id)) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '아이디는 영문 및 숫자로만 4~16자리여야 합니다.' 
            }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        if (!password) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '비밀번호를 입력해 주세요.' 
            }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        const hashedInputPw = await hashPassword(password);
        const user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(user_id).first();

        // 1. 아이디 및 비밀번호 검증
        if (!user || user.password_hash !== hashedInputPw) {
            await db.prepare(`
                INSERT INTO login_logs (user_id, ip_address, user_agent, login_status)
                VALUES (?, ?, ?, 'FAIL')
            `).bind(user_id, clientIP, userAgent).run();

            return new Response(JSON.stringify({ 
                success: false, 
                error: '아이디 또는 비밀번호가 일치하지 않습니다.' 
            }), { status: 401, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        // 💡 2. [핵심] 계정 상태 검증 (정지/차단된 계정 로그인 원천 차단)
        if (user.status === 'BLOCKED') {
            await db.prepare(`
                INSERT INTO login_logs (user_id, ip_address, user_agent, login_status)
                VALUES (?, ?, ?, 'FAIL')
            `).bind(user_id, clientIP, userAgent).run();

            return new Response(JSON.stringify({ 
                success: false, 
                error: '이용이 정지(차단)된 계정입니다. 관리자에게 문의하세요.' 
            }), { status: 403, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        // 3. 정상 계정 로그인 성공 처리 및 세션 쿠키 발급
        await db.prepare(`
            INSERT INTO login_logs (user_id, ip_address, user_agent, login_status)
            VALUES (?, ?, ?, 'SUCCESS')
        `).bind(user_id, clientIP, userAgent).run();

        const sessionPayload = JSON.stringify({
            user_id: user.user_id,
            nickname: user.nickname,
            role: user.role,
            timestamp: Date.now()
        });
        const sessionToken = btoa(unescape(encodeURIComponent(sessionPayload)));
        const cookieHeader = `auth_token=${sessionToken}; Path=/; Max-Age=3600; SameSite=Lax; Secure; HttpOnly`;

        return new Response(JSON.stringify({
            success: true,
            user: {
                user_id: user.user_id,
                nickname: user.nickname,
                role: user.role
            }
        }), {
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Set-Cookie': cookieHeader
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const cookieHeader = request.headers.get('Cookie') || '';

    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];
    if (!token) {
        return new Response(JSON.stringify({ loggedIn: false }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const decoded = decodeURIComponent(escape(atob(token)));
        const session = JSON.parse(decoded);

        // 💡 이미 로그인된 상태에서 관리자가 실시간으로 계정을 정지했을 때 즉시 세션 무효화
        if (session && session.user_id) {
            const db = env.DB;
            const currentUser = await db.prepare("SELECT status FROM users WHERE user_id = ?").bind(session.user_id).first();
            if (currentUser && currentUser.status === 'BLOCKED') {
                const expireCookie = 'auth_token=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly';
                return new Response(JSON.stringify({ loggedIn: false, error: '계정이 정지되었습니다.' }), {
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Set-Cookie': expireCookie
                    }
                });
            }
        }

        return new Response(JSON.stringify({
            loggedIn: true,
            user: {
                user_id: session.user_id,
                nickname: session.nickname,
                role: session.role
            }
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    } catch (_) {
        return new Response(JSON.stringify({ loggedIn: false }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}

export async function onRequestDelete() {
    const expireCookie = 'auth_token=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly';
    return new Response(JSON.stringify({ success: true, message: '로그아웃 되었습니다.' }), {
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Set-Cookie': expireCookie
        }
    });
}