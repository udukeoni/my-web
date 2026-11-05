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
        // 네이버 증권 공식 자동완성/검색 API
        const naverSearchUrl = `https://m.stock.naver.com/front-api/v1/search/auto-complete?keyword=${encodeURIComponent(query)}`;
        
        const res = await fetch(naverSearchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://m.stock.naver.com/'
            }
        });

        if (!res.ok) {
            throw new Error(`네이버 API 응답 에러 (${res.status})`);
        }

        const data = await res.json();
        
        // 네이버 검색 응답 트리 추출 (auto-complete 트리 및 다중 규격 대응)
        let searchList = [];
        if (data.result && Array.isArray(data.result.searchList)) {
            searchList = data.result.searchList;
        } else if (Array.isArray(data.items)) {
            searchList = data.items;
        } else if (data.result && Array.isArray(data.result.items)) {
            searchList = data.result.items;
        } else if (data.result && data.result.stockList && Array.isArray(data.result.stockList)) {
            searchList = data.result.stockList;
        }

        const items = searchList
            .map(item => {
                const code = item.itemCode || item.code || item.stockCode || item.reutersCode || '';
                const name = item.stockName || item.name || item.stock_name || '';
                const market = item.marketName || item.market || item.typeName || '국내';
                return { ticker: String(code).trim().toUpperCase(), name: String(name).trim(), market };
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