// functions/api/register.js
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const db = env.DB;
        const body = await request.json();
        const { user_id, password, nickname } = body;

        // 1. 유효성 검사 (아이디: 영문/숫자 4~16자리)
        const idRegex = /^[a-zA-Z0-9]{4,16}$/;
        if (!user_id || !idRegex.test(user_id)) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '아이디는 영문 및 숫자로만 4~16자리여야 합니다.' 
            }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        if (!password || password.length < 4) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '비밀번호는 최소 4자리 이상 입력해 주세요.' 
            }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        const userNickname = (nickname && nickname.trim()) ? nickname.trim() : `개미_${user_id.slice(0, 4)}`;

        // 2. 기존 users 테이블 내 중복 아이디 검사
        const existing = await db.prepare("SELECT user_id FROM users WHERE user_id = ?").bind(user_id).first();
        if (existing) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.' 
            }), { status: 409, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }

        // 3. 비밀번호 SHA-256 암호화 해싱 (기존 로그인 방식과 100% 동일 규격)
        const hashedPassword = await hashPassword(password);

        // 4. 기존 D1 users 테이블에 신규 일반 회원(USER)으로 등록
        await db.prepare(`
            INSERT INTO users (user_id, password_hash, nickname, role, status)
            VALUES (?, ?, ?, 'USER', 'ACTIVE')
        `).bind(user_id, hashedPassword, userNickname).run();

        return new Response(JSON.stringify({
            success: true,
            message: '회원가입이 완료되었습니다. 로그인해 주세요!'
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '회원가입 처리 중 오류: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}