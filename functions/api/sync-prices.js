// functions/api/sync-prices.js

export async function onRequestPost(context) {
    const { env } = context;

    try {
        const db = env.DB;

        // 1. 등록된 주식/ETF 종목 조회
        const assetsResult = await db.prepare("SELECT ticker, asset_name, current_price FROM assets").all();
        const assets = assetsResult.results;

        if (!assets || assets.length === 0) {
            return new Response(JSON.stringify({ success: false, error: "등록된 종목이 없습니다." }), {
                headers: { "Content-Type": "application/json; charset=UTF-8" }
            });
        }

        const updatedList = [];
        const updateStatements = [];

        // 2. 네이버 증권에서 최신 현재가 및 일간 등락률 실시간 수집
        await Promise.allSettled(assets.map(async (asset) => {
            try {
                const naverUrl = `https://m.stock.naver.com/api/stock/${asset.ticker}/basic`;
                const res = await fetch(naverUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    const rawPrice = data.nowPrice || data.closePrice;
                    
                    let dailyRate = parseFloat(data.fluctuationsRatio || 0);
                    if (isNaN(dailyRate)) dailyRate = 0;

                    if (data.compareToPreviousPrice && (data.compareToPreviousPrice.code === '4' || data.compareToPreviousPrice.code === '5') && dailyRate > 0) {
                        dailyRate = -dailyRate;
                    }

                    if (rawPrice) {
                        const newPrice = Number(String(rawPrice).replace(/,/g, ''));
                        if (!isNaN(newPrice) && newPrice > 0) {
                            updateStatements.push(
                                db.prepare("UPDATE assets SET current_price = ? WHERE ticker = ?")
                                  .bind(newPrice, asset.ticker)
                            );
                            updatedList.push({
                                ticker: asset.ticker,
                                name: asset.asset_name,
                                current_price: newPrice,
                                dailyRate: dailyRate
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`[가격 조회 실패] ${asset.ticker}:`, err.message);
            }
        }));

        if (updateStatements.length > 0) {
            await db.batch(updateStatements);
        }

        return new Response(JSON.stringify({
            success: true,
            totalCount: assets.length,
            updatedCount: updatedList.length,
            updatedAt: new Date().toISOString(),
            dailyRates: updatedList.reduce((acc, cur) => {
                acc[cur.ticker] = cur.dailyRate;
                return acc;
            }, {})
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