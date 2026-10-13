// functions/api/sync-prices.js

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. D1 DB에 등록된 주식/ETF 종목 목록 조회
        const assetsResult = await db.prepare("SELECT ticker, asset_name, current_price FROM assets").all();
        const assets = assetsResult.results;

        if (!assets || assets.length === 0) {
            return new Response(JSON.stringify({ success: false, error: "등록된 종목이 없습니다." }), {
                headers: { "Content-Type": "application/json; charset=UTF-8" }
            });
        }

        const updatedList = [];
        const updateStatements = [];

        // 2. 각 종목별 네이버 증권 모바일 API를 통해 현재가 조회
        await Promise.allSettled(assets.map(async (asset) => {
            try {
                // 국내 주식/ETF 네이버 증권 모바일 엔드포인트
                const naverUrl = `https://m.stock.naver.com/api/stock/${asset.ticker}/basic`;
                const res = await fetch(naverUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    // nowPrice 또는 closePrice 파싱 (콤마 제거 후 숫자로 변환)
                    const rawPrice = data.nowPrice || data.closePrice;
                    if (rawPrice) {
                        const newPrice = Number(String(rawPrice).replace(/,/g, ''));
                        if (!isNaN(newPrice) && newPrice > 0) {
                            updateStatements.push(
                                db.prepare("UPDATE assets SET current_price = ? WHERE ticker = ?").bind(newPrice, asset.ticker)
                            );
                            updatedList.push({
                                ticker: asset.ticker,
                                name: asset.asset_name,
                                oldPrice: asset.current_price,
                                newPrice: newPrice
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`[가격 조회 실패] ${asset.ticker}:`, err.message);
            }
        }));

        // 3. D1 DB에 최신 현재가 일괄 일괄 반영 (배치 쿼리 실행)
        if (updateStatements.length > 0) {
            await db.batch(updateStatements);
        }

        return new Response(JSON.stringify({
            success: true,
            totalCount: assets.length,
            updatedCount: updatedList.length,
            updatedAt: new Date().toISOString(),
            updatedList
        }), {
            headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-cache" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=UTF-8" }
        });
    }
}