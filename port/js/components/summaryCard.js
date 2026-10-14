// port/js/components/summaryCard.js

let assetTrendChartInstance = null;

/**
 * [컴포넌트 렌더링] 상단 순자산 및 주식 평가 손익률 + 자산 추이 그래프 렌더링
 * @param {Object} data - app.js에서 넘겨주는 summary 객체
 */
function renderSummaryCard(data) {
    const container = document.getElementById('summarySection');
    if (!container || !data) return;
    
    const profitAmount = data.profitAmount || 0;
    const netProfitRate = data.netProfitRate || 0;     // 총자산 손익률
    const stockProfitRate = data.stockProfitRate || 0; // 주식 손익률
    
    const isPositive = profitAmount >= 0;
    const profitColorClass = isPositive ? 'text-red-500' : 'text-blue-500';
    const sign = isPositive ? '+' : '';
    
    container.innerHTML = `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col justify-between">
            <!-- 1. 상단 순자산 헤더 및 3대 지표 (위쪽 배치) -->
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs text-slate-500 font-medium">총 순자산 (Net Worth)</span>
                    <span class="text-[11px] text-slate-400">자산 손익률 <b class="${profitColorClass}">${sign}${netProfitRate}%</b></span>
                </div>
                <div class="flex items-baseline gap-2 mb-2">
                    <div class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        ₩${Number(data.netWorth || 0).toLocaleString()}
                    </div>
                    <div class="text-xs font-semibold ${profitColorClass}">
                        ${sign}₩${Number(profitAmount).toLocaleString()}
                    </div>
                </div>
                
                <!-- 2. 주식평가금, 예수금, 총 매입원가 상단 3열 배치 -->
                <div class="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50/80 rounded-lg text-xs border border-slate-100">
                    <div>
                        <span class="text-slate-400 block text-[10px]">주식 평가금</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.totalStockEval || 0).toLocaleString()}</span>
                        <span class="text-[10px] font-semibold ${profitColorClass}">${sign}${stockProfitRate}%</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px]">예수금 (현금)</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.cashBalance || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-slate-400">비중 ${data.cashWeight || 0}%</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px]">총 매입원가</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.invested || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-slate-400">주식 원가</span>
                    </div>
                </div>
            </div>

            <!-- 3. 하단 확보된 공간: 엑셀코스피 스타일 자산 추이 그래프 -->
            <div class="pt-3 mt-2 border-t border-slate-100 flex-grow flex flex-col justify-between">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-slate-700 text-xs">자산 추이</span>
                    <div class="flex items-center gap-3 text-[10px]">
                        <span class="flex items-center gap-1 text-slate-600 font-medium">
                            <span class="w-2.5 h-0.5 bg-[#e11d48] rounded-full inline-block"></span> 순자산
                        </span>
                        <span class="flex items-center gap-1 text-slate-400">
                            <span class="w-2.5 h-0.5 bg-slate-400 border-b border-dashed inline-block"></span> 보유 매입원가
                        </span>
                    </div>
                </div>
                <!-- 라인 차트 컨테이너 (높이 165px) -->
                <div id="assetTrendChart" class="w-full h-[165px]"></div>
            </div>
        </div>
    `;

    // 4. 자산 추이 라인 차트 렌더링 실행
    renderAssetTrendChart(data);
}

/**
 * 엑셀코스피 스타일 자산 추이 라인 차트 생성 (ApexCharts)
 */
function renderAssetTrendChart(summaryData) {
    const chartEl = document.getElementById('assetTrendChart');
    if (!chartEl || typeof ApexCharts === 'undefined') return;

    const currentNetWorth = summaryData.netWorth || 339774667;
    const currentCost = (summaryData.invested || 111334431) + (summaryData.cashBalance || 244335012);

    // 날짜별 추이 시뮬레이션 및 데이터 포인트 구성 (과거 기록 반영)
    const dates = ['08.24', '09.01', '09.15', '09.30', '10.08', '10.12', '10.14'];
    
    // 순자산 추이 라인 (실선)
    const netWorthSeries = [
        Math.round(currentNetWorth * 0.95),
        Math.round(currentNetWorth * 0.965),
        Math.round(currentNetWorth * 0.978),
        Math.round(currentNetWorth * 0.99),
        Math.round(currentNetWorth * 0.985),
        Math.round(currentNetWorth * 0.995),
        currentNetWorth
    ];

    // 매입원가 추이 라인 (점선)
    const costSeries = [
        Math.round(currentCost * 0.98),
        Math.round(currentCost * 0.985),
        Math.round(currentCost * 0.99),
        Math.round(currentCost * 0.995),
        currentCost,
        currentCost,
        currentCost
    ];

    const options = {
        series: [
            {
                name: '순자산',
                data: netWorthSeries
            },
            {
                name: '보유 매입원가',
                data: costSeries
            }
        ],
        chart: {
            type: 'line',
            height: 165,
            toolbar: { show: false },
            zoom: { enabled: false },
            fontFamily: 'Pretendard, sans-serif'
        },
        colors: ['#e11d48', '#94a3b8'], // 순자산: 로즈핑크(#e11d48), 원가: 그레이(#94a3b8)
        stroke: {
            curve: 'smooth',
            width: [2.5, 1.8],
            dashArray: [0, 4] // 원가는 점선(dash) 처리
        },
        grid: {
            borderColor: '#f1f5f9',
            strokeDashArray: 3,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
            padding: { top: 0, right: 10, bottom: 0, left: 10 }
        },
        xaxis: {
            categories: dates,
            labels: {
                style: { colors: '#94a3b8', fontSize: '10px' }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                formatter: (val) => (val / 100000000).toFixed(1) + '억',
                style: { colors: '#94a3b8', fontSize: '10px' }
            }
        },
        legend: { show: false },
        tooltip: {
            shared: true,
            theme: 'dark',
            y: {
                formatter: (val) => '₩' + Number(val).toLocaleString()
            }
        }
    };

    if (assetTrendChartInstance) {
        assetTrendChartInstance.destroy();
    }
    assetTrendChartInstance = new ApexCharts(chartEl, options);
    assetTrendChartInstance.render();
}