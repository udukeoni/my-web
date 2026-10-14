// port/js/components/treemapChart.js

/**
 * [컴포넌트] 증권사 스타일 커스텀 HTML 트리맵 렌더러
 * - 세로 글씨 회전 완벽 방지 (항상 가로 텍스트 유지)
 * - 좌측 상단: 종목명 + 손익률 / 우측 하단: 비중(%) 분리 배치
 * - 1.5% 미만 소액 종목은 '기타 N개' 타일로 자동 그룹화하여 찌그러짐 방지
 */
let lastTreemapHoldings = null;

// ETF 브랜드 접두사 축약 (타일 내 가독성 극대화)
function shortenAssetName(name) {
    if (!name) return '';
    let s = name.replace(/^(KODEX|TIGER|RISE|SOL|ACE|TIMEFOLIO|TIME|KIWOOM|HANARO|PLUS|WON)\s+/i, '');
    s = s.replace('타겟위클리커버드콜', '타겟위클리')
         .replace('타겟데일리커버드콜', '타겟데일리')
         .replace('데일리고정커버드콜', '데일리고정')
         .replace('커버드콜액티브', '커버드콜')
         .replace('(합성)', '');
    return s.trim() || name;
}

function renderTreemapChart(holdings) {
    lastTreemapHoldings = holdings;
    const container = document.getElementById('treemapChart');
    if (!container) return;

    if (!holdings || holdings.length === 0) {
        container.innerHTML = `
            <div class="h-[240px] flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed border-slate-200">
                보유 주식이 없어 비중 차트를 표시할 수 없습니다.
            </div>`;
        return;
    }

    const totalEval = holdings.reduce((sum, h) => sum + (h.eval_amount || 0), 0);
    if (totalEval <= 0) return;

    // 1. 동일 종목(여러 계좌 중복 보유) 합산 처리
    const mergedMap = new Map();
    holdings.forEach(h => {
        const key = h.ticker || h.asset_name;
        if (!mergedMap.has(key)) {
            mergedMap.set(key, {
                name: h.asset_name,
                shortName: shortenAssetName(h.asset_name),
                evalAmount: 0,
                buyAmount: 0
            });
        }
        const item = mergedMap.get(key);
        item.evalAmount += (h.eval_amount || 0);
        item.buyAmount += (h.buy_amount || 0);
    });

    const mergedList = Array.from(mergedMap.values()).map(item => {
        const profit = item.evalAmount - item.buyAmount;
        const profitRate = item.buyAmount > 0 ? Number(((profit / item.buyAmount) * 100).toFixed(1)) : 0;
        const weight = Number(((item.evalAmount / totalEval) * 100).toFixed(1));
        return {
            ...item,
            profitRate,
            weight,
            value: item.evalAmount
        };
    }).sort((a, b) => b.value - a.value);

    // 2. 비중이 너무 작은 종목(1.8% 미만 & 상위 12개 밖)은 '기타 N개'로 묶어 세로 찌그러짐 방지
    const mainItems = [];
    const minorItems = [];
    mergedList.forEach((item, idx) => {
        if (idx < 11 && item.weight >= 1.8) {
            mainItems.push(item);
        } else {
            minorItems.push(item);
        }
    });

    if (minorItems.length === 1) {
        mainItems.push(minorItems[0]);
    } else if (minorItems.length > 1) {
        const etcEval = minorItems.reduce((s, i) => s + i.evalAmount, 0);
        const etcBuy = minorItems.reduce((s, i) => s + i.buyAmount, 0);
        const etcProfitRate = etcBuy > 0 ? Number((((etcEval - etcBuy) / etcBuy) * 100).toFixed(1)) : 0;
        const etcWeight = Number(((etcEval / totalEval) * 100).toFixed(1));
        mainItems.push({
            name: `기타 ${minorItems.length}개 종목`,
            shortName: `기타 ${minorItems.length}개`,
            evalAmount: etcEval,
            buyAmount: etcBuy,
            profitRate: etcProfitRate,
            weight: etcWeight,
            value: etcEval,
            isEtc: true
        });
    }

    // 3. 컨테이너 픽셀 크기에 맞춰 정사각형에 가까운 Binary Treemap 분할 계산
    const width = container.clientWidth || 600;
    const height = 248;

    const rects = [];
    function partition(items, x, y, w, h) {
        if (!items || items.length === 0) return;
        if (items.length === 1) {
            rects.push({ ...items[0], x, y, w, h });
            return;
        }

        const total = items.reduce((s, i) => s + i.value, 0);
        let acc = 0;
        let splitIdx = 0;
        for (let i = 0; i < items.length - 1; i++) {
            acc += items[i].value;
            splitIdx = i + 1;
            if (acc >= total / 2) break;
        }

        const ratio = total > 0 ? acc / total : 0.5;
        const leftItems = items.slice(0, splitIdx);
        const rightItems = items.slice(splitIdx);

        // 가로가 넓으면 좌우 분할, 세로가 길면 상하 분할 (세로로 길쭉해지는 현상 방지)
        if (w >= h * 1.05) {
            const w1 = w * ratio;
            partition(leftItems, x, y, w1, h);
            partition(rightItems, x + w1, y, w - w1, h);
        } else {
            const h1 = h * ratio;
            partition(leftItems, x, y, w, h1);
            partition(rightItems, x, y + h1, w, h - h1);
        }
    }

    partition(mainItems, 0, 0, width, height);

    // 4. HTML 타일 렌더링
    const tilesHtml = rects.map(r => {
        const isPos = r.profitRate > 0;
        const isZero = r.profitRate === 0;

        // 배경색 및 텍스트 색상 (토스/증권사 스타일 파스텔 톤)
        let bgClass = 'bg-[#edf6ff] hover:bg-[#e0effe]'; // 하락: 연하늘
        let rateColor = 'text-[#1b64da]';                // 하락 텍스트: 선명한 파랑

        if (r.isEtc) {
            bgClass = 'bg-slate-100 hover:bg-slate-200/80';
            rateColor = 'text-slate-600';
        } else if (isPos) {
            bgClass = 'bg-[#fff0f2] hover:bg-[#ffe4e8]'; // 상승: 연분홍
            rateColor = 'text-[#e11d48]';                // 상승 텍스트: 선명한 빨강
        } else if (isZero) {
            bgClass = 'bg-slate-100 hover:bg-slate-200';
            rateColor = 'text-slate-600';
        }

        const sign = isPos ? '+' : '';
        const area = r.w * r.h;

        // 타일 크기에 따른 반응형 폰트 사이즈 및 표시 여부 결정
        let titleSize = 'text-[13px]';
        let rateSize = 'text-[12px]';
        let weightSize = 'text-[11px]';
        let paddingClass = 'p-2.5';

        if (area < 4500 || r.w < 75 || r.h < 52) {
            titleSize = 'text-[11px]';
            rateSize = 'text-[10px]';
            weightSize = 'text-[10px]';
            paddingClass = 'p-1.5';
        } else if (area > 18000 && r.w > 130 && r.h > 95) {
            titleSize = 'text-[15px]';
            rateSize = 'text-[13px]';
            weightSize = 'text-[12px]';
            paddingClass = 'p-3';
        }

        const showRate = r.h >= 38 && r.w >= 48;
        const showWeight = r.h >= 54 && r.w >= 55;
        const displayName = r.w < 95 ? r.shortName : r.name;

        return `
            <div style="left:${r.x.toFixed(1)}px; top:${r.y.toFixed(1)}px; width:${r.w.toFixed(1)}px; height:${r.h.toFixed(1)}px;"
                 class="absolute p-[2px] box-border transition-all duration-200"
                 title="${r.name} | 평가금: ₩${Number(r.evalAmount).toLocaleString()} | 수익률: ${sign}${r.profitRate}% | 비중: ${r.weight}%">
                <div class="w-full h-full ${bgClass} rounded-lg ${paddingClass} flex flex-col justify-between overflow-hidden relative select-none border border-white/60 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]">
                    <div class="min-w-0">
                        <div class="font-bold text-slate-900 ${titleSize} leading-snug truncate">${displayName}</div>
                        ${showRate ? `<div class="font-extrabold ${rateColor}${rateSize} leading-tight mt-0.5 truncate">${sign}${r.profitRate}%</div>` : ''}
                    </div>
                    ${showWeight ? `
                    <div class="text-right font-bold text-slate-500/90 ${weightSize} leading-none mt-auto">
                        ${Math.round(r.weight)}%
                    </div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="relative w-full h-[248px] overflow-hidden rounded-lg">${tilesHtml}</div>`;
}

// 창 크기 변경 시 비율 자동 재계산
window.addEventListener('resize', () => {
    if (lastTreemapHoldings) {
        renderTreemapChart(lastTreemapHoldings);
    }
});