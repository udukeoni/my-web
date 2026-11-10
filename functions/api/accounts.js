// functions/api/accounts.js
export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 세션 쿠키에서 user_id 추출
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];
    if (!token) {
        return new Response(JSON.stringify({ success: false, error: '로그인이 필요합니다.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    let currentUserId = '';
    try {
        const decoded = decodeURIComponent(escape(atob(token)));
        const session = JSON.parse(decoded);
        currentUserId = session.user_id;
    } catch (_) {
        return new Response(JSON.stringify({ success: false, error: '세션 정보가 올바르지 않습니다.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }

    try {
        const db = env.DB;
        const body = await request.json();
        const { account_name, broker, account_type } = body;

        // 2. 계좌명 유효성 검사 (텍스트 직접 입력 필수)
        if (!account_name || !account_name.trim()) {
            return new Response(JSON.stringify({ success: false, error: '계좌명을 입력해 주세요.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            });
        }

        const trimmedName = account_name.trim();
        const inputBroker = (broker && broker.trim()) ? broker.trim() : '증권사';
        const inputType = (account_type && account_type.trim()) ? account_type.trim() : '일반위탁';

        // 3. 고유한 account_id 생성 (사용자ID_고유시간값)
        const account_id = `${currentUserId.toUpperCase()}_ACC_${Date.now().toString(36).toUpperCase()}`;

        // 4. accounts 테이블에 신규 계좌 영구 등록
        await db.prepare(`
            INSERT INTO accounts (account_id, account_name, broker, account_type, strategy, cash_balance, user_id)
            VALUES (?, ?, ?, ?, '자유 자산배분', 0, ?)
        `).bind(account_id, trimmedName, inputBroker, inputType, currentUserId).run();

        return new Response(JSON.stringify({
            success: true,
            message: `'${trimmedName}' 계좌가 성공적으로 개설되었습니다!`,
            account: {
                account_id,
                account_name: trimmedName,
                broker: inputBroker,
                account_type: inputType,
                cash_balance: 0
            }
        }), {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: '계좌 추가 오류: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
    }
}