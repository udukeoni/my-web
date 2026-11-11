// functions/api/auth.js
// 단방향 해시 검증, 접속 IP/브라우저 감사 로깅(KST 명시), 1시간(3600초) 보안 세션 쿠키

// Web Crypto API를 사용한 안전한 SHA-256 단방향 해싱 함수
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 💡 한국 표준시(KST) 날짜 및 시각 문자열 생성 함수 (YYYY-MM-DD HH:mm:ss)
function getKstDateTimeString() {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
}

// 1. 로그인 처리 (POST)
export async function onRequestPost(context) {
    const { request, env } = context;
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';
    const kstTime = getKstDateTimeString();

    try {
        const db = env.DB;
        const { user_id, password } = await request.json();

        // 1) 입력값 유효성 검사 (영문, 숫자 4~16자 제한)
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

        // 2) 비밀번호 SHA-256 해시 계산
        const hashedInputPw = await hashPassword(password);

        // 3) DB에서 계정 정보 조회
        const user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(user_id).first();

        // 💡 계정이 없거나 비밀번호가 틀린 경우 -> FAIL 로깅 (attempt_time 직접 바인딩)
        if (!user || user.password_hash !== hashedInputPw) {
            try {
                await db.prepare(`
                    INSERT INTO login_logs (user_id, ip_address, user_agent, login_status, attempt_time)
                    VALUES (?, ?, ?, 'FAIL', ?)
                `).bind(user_id, clientIP, userAgent, kstTime).run();
            } catch (logErr) {
                console.error("로그인 실패 로그 기록 예외:", logErr);
            }

            return new Response(JSON.stringify({ 
                success: false, 
                error: '아이디 또는 비밀번호가 일치하지 않습니다.' 
            }), { status: 401, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        // 💡 계정이 정지(BLOCKED) 상태인 경우 -> FAIL 로깅 후 403 차단
        if (user.status === 'BLOCKED') {
            try {
                await db.prepare(`
                    INSERT INTO login_logs (user_id, ip_address, user_agent, login_status, attempt_time)
                    VALUES (?, ?, ?, 'FAIL', ?)
                `).bind(user_id, clientIP, userAgent, kstTime).run();
            } catch (logErr) {
                console.error("정지 계정 로그 기록 예외:", logErr);
            }

            return new Response(JSON.stringify({ 
                success: false, 
                error: '관리자에 의해 이용이 정지(차단)된 계정입니다. 관리자에게 문의하세요.' 
            }), { status: 403, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        // 💡 4) 로그인 성공 감사 로그 기록 (attempt_time 직접 바인딩)
        try {
            await db.prepare(`
                INSERT INTO login_logs (user_id, ip_address, user_agent, login_status, attempt_time)
                VALUES (?, ?, ?, 'SUCCESS', ?)
            `).bind(user_id, clientIP, userAgent, kstTime).run();
        } catch (logErr) {
            console.error("로그인 성공 로그 기록 예외:", logErr);
        }

        // 5) 보안 세션 쿠키 토큰 생성 (base64 인코딩)
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

// 2. 현재 로그인 상태 및 내 정보 확인 (GET)
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

        // 실시간 계정 정지 여부 확인
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