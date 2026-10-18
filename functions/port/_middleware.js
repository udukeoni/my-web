// functions/port/_middleware.js
// /port/* 경로(자산 대시보드, 상세장부 등) 비로그인 접근 원천 차단 게이트웨이

export async function onRequest(context) {
    const { request, next } = context;
    const cookieHeader = request.headers.get('Cookie') || '';

    // 브라우저 쿠키에서 auth_token 추출
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
        })
    );

    const token = cookies['auth_token'];

    // 1. 토큰이 아예 없는 경우 -> 로그인 페이지로 즉시 강제 튕겨내기(리다이렉트)
    if (!token) {
        return Response.redirect(new URL('/login.html', request.url), 302);
    }

    try {
        // 2. 토큰 구조 검증
        const decoded = decodeURIComponent(escape(atob(token)));
        const session = JSON.parse(decoded);

        if (!session || !session.user_id) {
            return Response.redirect(new URL('/login.html', request.url), 302);
        }

        // 정상 로그인된 사용자 -> 원래 보려던 포트폴리오 페이지 통과
        return await next();

    } catch (e) {
        // 위조되거나 손상된 세션 토큰인 경우 로그인 화면으로 이동
        return Response.redirect(new URL('/login.html', request.url), 302);
    }
}