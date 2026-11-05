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
        // 네이버 증권 모바일 검색 API 호출 (국내 주식 및 ETF)
        const naverSearchUrl = `https://m.stock.naver.com/api/json/search/searchListJson.nhn?keyword=${encodeURIComponent(query)}`;
        
        const res = await fetch(naverSearchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://m.stock.naver.com/'
            }
        });

        if (!res.ok) {
            throw new Error(`네이버 검색 API 응답 오류: ${res.status}`);
        }

        const data = await res.json();
        const searchList = (data.result && data.result.searchList) ? data.result.searchList : [];

        // 유효한 종목코드와 종목명 추출 (국내주식 및 ETF 위주 필터링)
        const items = searchList
            .filter(item => item.itemCode && item.stockName)
            .map(item => ({
                ticker: item.itemCode.trim().toUpperCase(),
                name: item.stockName.trim(),
                market: item.marketName || '국내'
            }));

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