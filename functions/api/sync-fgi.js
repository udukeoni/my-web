// functions/api/sync-fgi.js

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. CNN Fear & Greed Index 공식 데이터 엔드포인트 호출
        const cnnUrl = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
        const res = await fetch(cnnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://edition.cnn.com/markets/fear-and-greed'
            }
        });

        if (!res.ok) {
            throw new Error(`CNN API 호출 실패: ${res.status}`);
        }

        const data = await res.json();
        const fgi = data.fear_and_greed;

        const score = Math.round(fgi.score);
        const rating = fgi.rating; // fear, greed, neutral 등
        const todayStr = new Date().toISOString().slice(0, 10);
        const updatedAt = new Date().toISOString();

        // 2. D1 DB에 당일 데이터 저장/갱신 (INSERT OR REPLACE)
        await db.prepare(`
            INSERT OR REPLACE INTO fgi_data (date, score, rating, updated_at)
            VALUES (?, ?, ?, ?)
        `).bind(todayStr, score, rating, updatedAt).run();

        return new Response(JSON.stringify({
            success: true,
            score,
            rating,
            date: todayStr,
            updatedAt
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