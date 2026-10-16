// port/js/components/summaryCard.js

let assetTrendChartInstance = null;
// 변경할 코드 (기본 탭을 '당일'로 설정)
let currentTrendPeriod = 'INTRADAY'; // 'INTRADAY'(당일) | '1M'(1개월) | '3M'(3개월) | 'ALL'(전체)
let cachedChartData = null;

function renderSummaryCard(data, chartData) {
    const container = document.getElementById('summarySection');
    if (!container || !data) return;
    if (chartData) cachedChartData = chartData;
    
    const profitAmount = data.profitAmount || 0;
    const netProfitRate = data.netProfitRate || 0;     // 총자산 손익률
    const stockProfitRate = data.stockProfitRate || 0; // 주식 손익률
    
    const isPositive = profitAmount >= 0;
    const profitColorClass = isPositive ? 'text-red-500' : 'text-blue-500';
    const sign = isPositive ? '+' : '';
    
    container.innerHTML = `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col justify-between">
            <!-- 1. 상단 순자산 및 3대 지표 -->
            <div>
                <!-- 상단: 총순자산(좌측) + 손익금액/손익률 위아래 배치(우측 빈공간) -->
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <span class="text-xs text-slate-500 font-medium block mb-1">총 순자산 (Net Worth)</span>
                        <div class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
                            ₩${Number(data.netWorth || 0).toLocaleString()}
                        </div>
                    </div>
                    <!-- 우측 빈 공간: 손실금액 / 손실률 위아래 정렬 -->
                    <div class="text-right">
                        <div class="text-xs sm:text-sm font-bold ${profitColorClass} leading-tight">
                            ${sign}₩${Number(profitAmount).toLocaleString()}
                        </div>
                        <div class="text-[11px] font-semibold ${profitColorClass} mt-0.5">
                            ${sign}${netProfitRate}%
                        </div>
                    </div>
                </div>
                
                <!-- 하단 3대 지표 순서 변경: [주식 평가금] -> [총 매입원가] -> [예수금 (현금)] -->
                <div class="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50/80 rounded-lg text-xs border border-slate-100">
                    <!-- 1. 주식 평가금 -->
                    <div>
                        <span class="text-slate-400 block text-[10px]">주식 평가금</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.totalStockEval || 0).toLocaleString()}</span>
                        <span class="text-[10px] font-semibold ${profitColorClass}">${sign}${stockProfitRate}%</span>
                    </div>
                    <!-- 2. 총 매입원가 -->
                    <div>
                        <span class="text-slate-400 block text-[10px]">총 매입원가</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.invested || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-slate-400">주식 원가</span>
                    </div>
                    <!-- 3. 예수금 (현금) -->
                    <div>
                        <span class="text-slate-400 block text-[10px]">예수금 (현금)</span>
                        <span class="font-bold text-slate-800 text-xs block">₩${Number(data.cashBalance || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-slate-400">비중 ${data.cashWeight || 0}%</span>
                    </div>
                </div>
            </div>

            <!-- 2. 하단 자산 추이 영역 (진짜 실데이터 연동) -->
            <div class="pt-3 mt-2 border-t border-slate-100 flex-grow flex flex-col justify-between">
                <div class="flex justify-between items-center mb-1.5">
                    <span id="btnSecretTrendHistory" class="font-bold text-slate-700 text-xs select-none">자산 추이</span>
                    <!-- 기간 필터 탭: 당일(장중) / 1개월 / 3개월 / 전체 -->
                    <div id="trendPeriodTabs" class="flex gap-1 text-[10px] bg-slate-100 p-0.5 rounded-md">
                        <button data-period="INTRADAY" class="trend-btn ${currentTrendPeriod === 'INTRADAY' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">당일</button>
                        <button data-period="1M" class="trend-btn ${currentTrendPeriod === '1M' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">1개월</button>
                        <button data-period="3M" class="trend-btn ${currentTrendPeriod === '3M' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">3개월</button>
                        <button data-period="ALL" class="trend-btn ${currentTrendPeriod === 'ALL' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">전체</button>
                    </div>
                </div>

                <div class="flex justify-end gap-3 text-[10px] mb-1">
                    <span class="flex items-center gap-1 text-slate-600 font-medium">
                        <span class="w-2.5 h-0.5 bg-[#e11d48] rounded-full inline-block"></span> 순자산
                    </span>
                    <span class="flex items-center gap-1 text-slate-400">
                        <span class="w-2.5 h-0.5 bg-slate-400 border-b border-dashed inline-block"></span> 총 원금
                    </span>
                </div>

                <div id="assetTrendChart" class="w-full h-[160px]"></div>
            </div>
        </div>
    `;

    renderAssetTrendChart();
    setupTrendPeriodTabs();
}

function renderAssetTrendChart() {
    const chartEl = document.getElementById('assetTrendChart');
    if (!chartEl || typeof ApexCharts === 'undefined') return;

    let categories = [];
    let netWorthSeries = [];
    let costSeries = [];

    const dailyData = (cachedChartData && cachedChartData.daily) ? cachedChartData.daily : [];
    const intraData = (cachedChartData && cachedChartData.intraday) ? cachedChartData.intraday : [];

    if (currentTrendPeriod === 'INTRADAY') {
        // [당일] 장중 30분 시간별 데이터 (09:00 ~ 15:30)
        if (intraData.length === 0) {
            chartEl.innerHTML = `<div class="h-[160px] flex items-center justify-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">장중 실시간 기록이 아직 없습니다. (09:00부터 수집)</div>`;
            return;
        }
        categories = intraData.map(d => d.recorded_at);
        netWorthSeries = intraData.map(d => d.net_worth);
        costSeries = intraData.map(d => d.invested);

    } else {
        // [1M / 3M / ALL] 일별/주별 실제 과거 데이터 (엑셀 데이터 기반)
        if (dailyData.length === 0) {
            chartEl.innerHTML = `<div class="h-[160px] flex items-center justify-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">기록된 과거 자산 데이터가 없습니다.</div>`;
            return;
        }

        let filtered = [...dailyData];
        if (currentTrendPeriod === '1M') {
            // 최근 30일 이내
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filtered = dailyData.filter(d => d.snapshot_date >= cutoff);
            if (filtered.length < 2) filtered = dailyData.slice(-5); // 최소 2개 이상 표시
        } else if (currentTrendPeriod === '3M') {
            // 최근 90일 이내
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filtered = dailyData.filter(d => d.snapshot_date >= cutoff);
        }

        // 날짜 형식 깔끔하게 포맷 (2026-08-20 -> 08.20)
        categories = filtered.map(d => {
            const parts = d.snapshot_date.split('-');
            return parts.length === 3 ? `${parts[1]}.${parts[2]}` : d.snapshot_date;
        });
        netWorthSeries = filtered.map(d => d.net_worth);
        costSeries = filtered.map(d => d.invested);
    }

    // Y축 단위 표기 (1억 이상은 '억', 1억 미만은 '만' 단위로 자동 전환)
    const yAxisFormatter = (val) => {
        if (val >= 100000000) {
            return (val / 100000000).toFixed(1) + '억';
        } else if (val >= 10000) {
            return Math.round(val / 10000) + '만';
        }
        return Number(val).toLocaleString();
    };

    const options = {
        series: [
            { name: '순자산', data: netWorthSeries },
            { name: '총 원금', data: costSeries }
        ],
        chart: {
            type: 'line',
            height: 160,
            toolbar: { show: false },
            zoom: { enabled: false },
            fontFamily: 'Pretendard, sans-serif'
        },
        colors: ['#e11d48', '#94a3b8'],
        stroke: {
            curve: 'smooth',
            width: [2.5, 1.8],
            dashArray: [0, 4]
        },
        grid: {
            borderColor: '#f1f5f9',
            strokeDashArray: 3,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
            padding: { top: 0, right: 8, bottom: 0, left: 8 }
        },
        xaxis: {
            categories: categories,
            labels: {
                style: { colors: '#94a3b8', fontSize: '10px' }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                formatter: yAxisFormatter,
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
    chartEl.innerHTML = '';
    assetTrendChartInstance = new ApexCharts(chartEl, options);
    assetTrendChartInstance.render();
}

function setupTrendPeriodTabs() {
    const buttons = document.querySelectorAll('.trend-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTrendPeriod = btn.getAttribute('data-period');
            buttons.forEach(b => {
                b.className = 'trend-btn text-slate-500 px-1.5 py-0.5 rounded transition';
            });
            btn.className = 'trend-btn bg-white font-bold text-slate-800 shadow-sm px-1.5 py-0.5 rounded transition';
            renderAssetTrendChart();
        });
    });
}

// 쉿! 아는 사람만 누를 수 있는 '자산 추이' 히든 상세 이동 이벤트
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btnSecretTrendHistory') {
        // 현재 선택된 기간(INTRADAY, 1M, 3M, ALL)을 가지고 상세 내역 페이지로 이동
        window.location.href = `trend-history.html?period=${currentTrendPeriod}&account=${currentAccount}`;
    }
});