// port/js/components/treemapChart.js

let lastTreemapHoldings = null;
let currentTreemapMode = 'CUMULATIVE'; // 'CUMULATIVE'(누적) | 'DAILY'(일간)

// ETF 브랜드 접두사 축약 함수
function shortenAssetName(name, width) {
    if (!name) return '';
    if (width >= 115) return name;

    let s = name.replace(/^(KODEX|TIGER|RISE|SOL|ACE|TIMEFOLIO|TIME|KIWOOM|HANARO|PLUS|WON)\s+/i, '');
    if (width < 80) {
        s = s.replace('타겟위클리커버드콜', '위클리')
             .replace('타겟데일리커버드콜', '데일리')
             .replace('데일리고정커버드콜', '데일리고정')
             .replace('커버드콜액티브', '커버드콜')
             .replace('(합성)', '');
    }
    return s.trim() || name;
}

// 0.01초 즉시 반응 플로팅 툴팁 엘리먼트 생성
function getOrCreateTooltip() {
    let tip = document.getElementById('treemapInstantTooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'treemapInstantTooltip';
        tip.className = 'fixed z-[9999] pointer-events-none hidden bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-sm max-w-xs';
        document.body.appendChild(tip);
    }
    return tip;
}

function renderTreemapChart(holdings) {
    lastTreemapHoldings = holdings;
    const container = document.getElementById('treemapChart');
    const subtitle = document.getElementById('treemapSubtitle');
    if (!container) return;

    if (subtitle) {
        subtitle.textContent = currentTreemapMode === 'DAILY' 
            ? '주식 보유 비중 · 일간(전일대비) 등락률' 
            : '주식 보유 비중 · 누적 수익률 기준';
    }

    if (!holdings || holdings.length === 0) {
        container.innerHTML = `
            <div class="h-[310px] flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed border-slate-200">
                보유 주식이 없어 비중 차트를 표시할 수 없습니다.
            </div>`;
        return;
    }

    const totalEval = holdings.reduce((sum, h) => sum + (h.eval_amount || 0), 0);
    if (totalEval <= 0) return;

    // 1. 중복 종목 합산
    const mergedMap = new Map();
    holdings.forEach(h => {
        const key = h.ticker || h.asset_name;
        if (!mergedMap.has(key)) {
            mergedMap.set(key, {
                ticker: h.ticker,
                name: h.asset_name,
                evalAmount: 0,
                buyAmount: 0,
                dailyRate: Number(h.daily_change_rate || 0)
            });
        }
        const item = mergedMap.get(key);
        item.evalAmount += (h.eval_amount || 0);
        item.buyAmount += (h.buy_amount || 0);
    });

    const allSorted = Array.from(mergedMap.values()).map(item => {
        const profit = item.evalAmount - item.buyAmount;
        const cumRate = item.buyAmount > 0 ? Number(((profit / item.buyAmount) * 100).toFixed(2)) : 0;
        const weight = Number(((item.evalAmount / totalEval) * 100).toFixed(1));
        const targetRate = currentTreemapMode === 'DAILY' ? Number(item.dailyRate.toFixed(2)) : cumRate;

        return {
            ...item,
            cumRate,
            targetRate,
            profitAmount: profit,
            weight,
            value: item.evalAmount
        };
    }).sort((a, b) => b.evalAmount - a.evalAmount);

    // 2. 비중 1.5% 미만 극소형 종목만 '기타' 타일로 스마트 그룹화
    const mainItems = [];
    const minorItems = [];

    allSorted.forEach(item => {
        if (item.weight >= 1.5) {
            mainItems.push(item);
        } else {
            minorItems.push(item);
        }
    });

    // 묶을 소액 종목이 1개 이하면 그냥 개별 표시, 2개 이상이면 '기타' 타일 생성
    if (minorItems.length === 1) {
        mainItems.push(minorItems[0]);
    } else if (minorItems.length > 1) {
        const etcEval = minorItems.reduce((s, i) => s + i.evalAmount, 0);
        const etcBuy = minorItems.reduce((s, i) => s + i.buyAmount, 0);
        const etcProfit = etcEval - etcBuy;
        const etcCumRate = etcBuy > 0 ? Number(((etcProfit / etcBuy) * 100).toFixed(2)) : 0;
        const etcWeight = Number(((etcEval / totalEval) * 100).toFixed(1));
        
        // 일간 등락률 가중평균 계산
        const etcDailyRate = etcEval > 0 
            ? Number((minorItems.reduce((s, i) => s + (i.dailyRate * i.evalAmount), 0) / etcEval).toFixed(2))
            : 0;

        const targetRate = currentTreemapMode === 'DAILY' ? etcDailyRate : etcCumRate;

        mainItems.push({
            ticker: 'ETC',
            name: `기타 ${minorItems.length}개`,
            evalAmount: etcEval,
            buyAmount: etcBuy,
            profitAmount: etcProfit,
            cumRate: etcCumRate,
            dailyRate: etcDailyRate,
            targetRate: targetRate,
            weight: etcWeight,
            value: etcEval,
            isEtc: true,
            subItems: minorItems // 팝업 툴팁에 뿌려줄 소액 종목 목록
        });
    }

    // 3. 분할 계산 (너비 800px, 높이 310px)
    const width = container.clientWidth || 800;
    const height = 310;

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

        if (w >= h * 1.08) {
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

    // 4. 타일 렌더링
    const tilesHtml = rects.map((r, index) => {
        const isPos = r.targetRate > 0;
        const isZero = r.targetRate === 0;

        let bgClass = 'bg-[#edf6ff] hover:bg-[#dbeafe]';
        let rateColor = 'text-[#1b64da]';

        if (r.isEtc) {
            bgClass = 'bg-slate-100 hover:bg-slate-200';
            rateColor = isPos ? 'text-[#e11d48]' : (isZero ? 'text-slate-600' : 'text-[#1b64da]');
        } else if (isPos) {
            bgClass = 'bg-[#fff0f2] hover:bg-[#ffe4e8]';
            rateColor = 'text-[#e11d48]';
        } else if (isZero) {
            bgClass = 'bg-slate-100 hover:bg-slate-200';
            rateColor = 'text-slate-600';
        }

        const sign = isPos ? '+' : '';
        const area = r.w * r.h;

        let titleSize = 'text-[13px]';
        let rateSize = 'text-[12px]';
        let weightSize = 'text-[11px]';
        let padClass = 'p-2.5';

        if (area > 18000 && r.w > 120 && r.h > 85) {
            titleSize = 'text-[15px]';
            rateSize = 'text-[14px]';
            weightSize = 'text-[12px]';
            padClass = 'p-3';
        } else if (area < 4500 || r.w < 65 || r.h < 46) {
            titleSize = 'text-[11px]';
            rateSize = 'text-[10px]';
            weightSize = 'text-[9px]';
            padClass = 'p-1.5';
        }

        const displayName = r.isEtc ? r.name : shortenAssetName(r.name, r.w);
        const showRate = r.h >= 28 && r.w >= 36;
        const showWeight = r.h >= 46 && r.w >= 46;

        return `
            <div data-idx="${index}"
                 style="left:${r.x.toFixed(1)}px; top:${r.y.toFixed(1)}px; width:${r.w.toFixed(1)}px; height:${r.h.toFixed(1)}px;"
                 class="treemap-tile absolute p-[1.5px] box-border cursor-pointer">
                <div class="w-full h-full ${bgClass} rounded-md ${padClass} flex flex-col justify-between overflow-hidden relative select-none border border-white/80 transition-colors duration-100">
                    <div class="min-w-0 leading-tight">
                        <div class="font-bold text-slate-900 ${titleSize} truncate">${displayName}</div>
                        ${showRate ? `<div class="font-extrabold ${rateColor}${rateSize} mt-0.5 truncate">${sign}${r.targetRate}%</div>` : ''}
                    </div>
                    ${showWeight ? `
                    <div class="text-right font-semibold text-slate-500/90 ${weightSize} leading-none mt-auto">
                        ${r.weight}%
                    </div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="relative w-full h-[310px] overflow-hidden rounded-lg">${tilesHtml}</div>`;

    // 5. 툴팁 팝업 연결 (기타 타일의 경우 하위 종목 리스트까지 렌더링)
    const tooltip = getOrCreateTooltip();
    const tileElements = container.querySelectorAll('.treemap-tile');

    tileElements.forEach(tile => {
        tile.addEventListener('mouseenter', () => {
            const idx = Number(tile.getAttribute('data-idx'));
            const item = rects[idx];
            if (!item) return;

            const cumSign = item.cumRate >= 0 ? '+' : '';
            const cumColor = item.cumRate >= 0 ? 'text-rose-400' : 'text-sky-400';
            const dailySign = item.dailyRate >= 0 ? '+' : '';
            const dailyColor = item.dailyRate >= 0 ? 'text-rose-400' : 'text-sky-400';

            if (item.isEtc) {
                // 기타 묶음 타일 전용 팝업 렌더링 (합계 + 하위 종목 리스트)
                const subListHtml = item.subItems.map(sub => {
                    const sSign = sub.cumRate >= 0 ? '+' : '';
                    const sColor = sub.cumRate >= 0 ? 'text-rose-400' : 'text-sky-400';
                    return `
                        <div class="flex justify-between items-center py-0.5 text-[10px] border-b border-slate-800/80">
                            <span class="truncate max-w-[130px] text-slate-300">${sub.name}</span>
                            <div class="text-right">
                                <span class="text-slate-400 mr-1.5">₩${Number(sub.evalAmount).toLocaleString()}</span>
                                <span class="font-bold ${sColor}">${sSign}${sub.cumRate}%</span>
                            </div>
                        </div>
                    `;
                }).join('');

                tooltip.innerHTML = `
                    <div class="font-bold text-amber-300 text-xs mb-1.5 border-b border-slate-700 pb-1 flex justify-between">
                        <span>${item.name} 합계</span>
                        <span>비중 ${item.weight}%</span>
                    </div>
                    <div class="space-y-0.5 text-[11px] mb-2 bg-slate-800/60 p-1.5 rounded">
                        <div class="flex justify-between"><span class="text-slate-400">총 평가금액</span><span class="font-bold text-white">₩${Number(item.evalAmount).toLocaleString()}</span></div>
                        <div class="flex justify-between"><span class="text-slate-400">누적 수익률</span><span class="font-bold ${cumColor}">${cumSign}${item.cumRate}% (${cumSign}₩${Number(item.profitAmount).toLocaleString()})</span></div>
                        <div class="flex justify-between"><span class="text-slate-400">일간 등락률</span><span class="font-bold ${dailyColor}">${dailySign}${Number(item.dailyRate).toFixed(2)}%</span></div>
                    </div>
                    <div class="text-[10px] text-slate-400 font-semibold mb-1">포함된 종목 내역:</div>
                    <div class="max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
                        ${subListHtml}
                    </div>
                `;
            } else {
                // 단일 개별 종목 팝업
                tooltip.innerHTML = `
                    <div class="font-bold text-white text-xs mb-1.5 border-b border-slate-700 pb-1">${item.name} <span class="text-slate-400 font-normal">(${item.ticker})</span></div>
                    <div class="space-y-1 text-[11px]">
                        <div class="flex justify-between gap-5"><span class="text-slate-400">평가금액</span><span class="font-bold text-white">₩${Number(item.evalAmount).toLocaleString()}</span></div>
                        <div class="flex justify-between gap-5"><span class="text-slate-400">주식 내 비중</span><span class="font-semibold text-white">${item.weight}%</span></div>
                        <div class="flex justify-between gap-5"><span class="text-slate-400">누적 수익률</span><span class="font-bold ${cumColor}">${cumSign}${item.cumRate}% (${cumSign}₩${Number(item.profitAmount).toLocaleString()})</span></div>
                        <div class="flex justify-between gap-5"><span class="text-slate-400">일간 등락률</span><span class="font-bold ${dailyColor}">${dailySign}${Number(item.dailyRate).toFixed(2)}%</span></div>
                    </div>
                `;
            }

            tooltip.classList.remove('hidden');
        });

        tile.addEventListener('mousemove', (e) => {
            const offset = 14;
            let left = e.clientX + offset;
            let top = e.clientY + offset;

            // 팝업이 화면 밖으로 벗어나지 않도록 방어
            if (left + 260 > window.innerWidth) left = e.clientX - 260;
            if (top + 220 > window.innerHeight) top = e.clientY - 200;

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        });

        tile.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
        });
    });
}

// [일간 / 누적] 탭 전환 이벤트 리스너 등록
function setupTreemapModeTabs() {
    const buttons = document.querySelectorAll('.treemap-mode-btn');
    if (!buttons.length) return;

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => {
                b.className = 'treemap-mode-btn px-2.5 py-1 rounded text-slate-500 hover:text-slate-800 transition';
            });
            btn.className = 'treemap-mode-btn bg-white px-2.5 py-1 rounded shadow-sm font-semibold text-slate-800 transition';

            currentTreemapMode = btn.getAttribute('data-mode');
            if (lastTreemapHoldings) {
                renderTreemapChart(lastTreemapHoldings);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', setupTreemapModeTabs);

// 창 크기 변경 시 비율 자동 재계산
window.addEventListener('resize', () => {
    if (lastTreemapHoldings) {
        renderTreemapChart(lastTreemapHoldings);
    }
});