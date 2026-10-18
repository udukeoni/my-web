// functions/api/auth.js
// 단방향 해시 검증, 접속 IP 감사 로깅, 1시간(3600초) 후 자동 파기 보안 세션 쿠키

// Web Crypto API를 사용한 안전한 SHA-256 단방향 해싱 함수
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 1. 로그인 처리 (POST)
export async function onRequestPost(context) {
    const { request, env } = context;
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';

    try {
        const db = env.DB;
        const { user_id, password } = await request.json();

        // 1) 입력값 유효성 검사 (영문, 숫자 4~16자 제한, 특수문자 금지)
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

        // 2) 비밀번호 단방향 SHA-256 해시 계산
        const hashedInputPw = await hashPassword(password);

        // 3) DB에서 계정 정보 조회
        const user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(user_id).first();

        // 계정이 없거나 비밀번호가 일치하지 않는 경우
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

        // 4) 로그인 성공 감사 로그 기록
        await db.prepare(`
            INSERT INTO login_logs (user_id, ip_address, user_agent, login_status)
            VALUES (?, ?, ?, 'SUCCESS')
        `).bind(user_id, clientIP, userAgent).run();

        // 5) 보안 세션 쿠키 토큰 생성 (base64 인코딩)
        const sessionPayload = JSON.stringify({
            user_id: user.user_id,
            nickname: user.nickname,
            role: user.role,
            timestamp: Date.now()
        });
        const sessionToken = btoa(unescape(encodeURIComponent(sessionPayload)));

        // 💡 1시간(3600초) 후 자동 소멸되는 보안 세션 쿠키 발급
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

// 2. 현재 로그인 상태 및 내 정보 확인 (GET)
export async function onRequestGet(context) {
    const { request } = context;
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

// 3. 로그아웃 처리 (DELETE) - 쿠키를 즉시 만료시켜 삭제
export async function onRequestDelete() {
    const expireCookie = 'auth_token=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly';
    return new Response(JSON.stringify({ success: true, message: '로그아웃 되었습니다.' }), {
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Set-Cookie': expireCookie
        }
    });
}