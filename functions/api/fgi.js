// functions/api/fgi.js

export async function onRequestGet(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // D1 DB에서 가장 최근에 저장된 공포탐욕지수 조회
        const result = await db.prepare("SELECT * FROM fgi_data ORDER BY date DESC, updated_at DESC LIMIT 1").first();

        if (!result) {
            // DB가 비어있는 경우 기본 중립값 반환
            return new Response(JSON.stringify({
                success: true,
                score: 50,
                rating: 'neutral',
                date: new Date().toISOString().slice(0, 10),
                updated_at: new Date().toISOString()
            }), {
                headers: { "Content-Type": "application/json; charset=UTF-8" }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            ...result
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}