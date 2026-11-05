// functions/api/search-stock.js
export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (!query.trim()) {
        return new Response(JSON.stringify({ success: true, items: [] }), {
            headers: { 
                'Content-Type': 'application/json; charset=UTF-8',
                'Cache-Control': 'no-cache'
            }
        });
    }

    try {
        // 네이버 증권 공식 실시간 종목 검색/자동완성 전용 엔드포인트
        const naverAcUrl = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock,index,ipo&q_enc=utf-8&r_enc=utf-8&st=111`;
        
        const res = await fetch(naverAcUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://finance.naver.com/'
            }
        });

        if (!res.ok) {
            throw new Error(`네이버 API 응답 에러 (${res.status})`);
        }

        const data = await res.json();
        
        // 네이버 ac 서버 응답 규격: data.items[0] 배열 안에 [[코드, 종목명, 시장명, ...], ...] 형태로 전달됨
        const rawList = (data.items && data.items[0]) ? data.items[0] : [];

        const items = rawList
            .map(row => {
                // row: ["종목명", "종목코드", "시장명(KOSPI/KOSDAQ 등)", ...]
                const name = Array.isArray(row) ? row[0] : (row.name || '');
                const code = Array.isArray(row) ? row[1] : (row.code || '');
                const market = Array.isArray(row) ? (row[2] || '국내') : (row.market || '국내');

                return {
                    ticker: String(code).trim().toUpperCase(),
                    name: String(name).trim(),
                    market: String(market).trim()
                };
            })
            .filter(item => item.ticker && item.name);

        return new Response(JSON.stringify({
            success: true,
            items: items
        }), {
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Cache-Control': 'no-cache'
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: err.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            }
        });
    }
}