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
        // 네이버 증권 공식 자동완성 API 호출
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
        
        // 💡 [핵심 방어 코드] 어떤 중첩 배열 형태가 오더라도 1차원 목록으로 안전하게 추출
        let rawList = [];
        if (data && Array.isArray(data.items)) {
            if (data.items.length > 0 && Array.isArray(data.items[0])) {
                rawList = data.items[0];
            } else {
                rawList = data.items;
            }
        }

        const items = [];
        if (Array.isArray(rawList)) {
            for (const row of rawList) {
                let name = '';
                let code = '';
                let market = '국내';

                if (Array.isArray(row)) {
                    // 네이버 기본 배열 포맷: [종목명, 종목코드, 시장구분, ...]
                    name = row[0] || '';
                    code = row[1] || '';
                    market = row[2] || '국내';
                } else if (typeof row === 'object' && row !== null) {
                    name = row.name || row.stockName || '';
                    code = row.code || row.ticker || row.itemCode || '';
                    market = row.market || row.marketName || '국내';
                }

                const cleanTicker = String(code).trim().toUpperCase();
                const cleanName = String(name).trim();

                if (cleanTicker && cleanName) {
                    items.push({
                        ticker: cleanTicker,
                        name: cleanName,
                        market: String(market).trim()
                    });
                }
            }
        }

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