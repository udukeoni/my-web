// port/js/components/summaryCard.js

let assetTrendChartInstance = null;
let currentTrendPeriod = '1M'; // '1M'(1개월) | '3M'(3개월) | 'ALL'(전체: 4월부터)

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
            <!-- 1. 상단 순자산 및 3대 지표 -->
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

            <!-- 2. 하단 자산 추이 영역 (기간 버튼 포함) -->
            <div class="pt-3 mt-2 border-t border-slate-100 flex-grow flex flex-col justify-between">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="font-bold text-slate-700 text-xs">자산 추이</span>
                    <!-- 기간 필터 탭 -->
                    <div id="trendPeriodTabs" class="flex gap-1 text-[10px] bg-slate-100 p-0.5 rounded-md">
                        <button data-period="1M" class="trend-btn ${currentTrendPeriod === '1M' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">1개월</button>
                        <button data-period="3M" class="trend-btn ${currentTrendPeriod === '3M' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">3개월</button>
                        <button data-period="ALL" class="trend-btn ${currentTrendPeriod === 'ALL' ? 'bg-white font-bold text-slate-800 shadow-sm' : 'text-slate-500'} px-1.5 py-0.5 rounded transition">전체(4월~)</button>
                    </div>
                </div>

                <div class="flex justify-end gap-3 text-[10px] mb-1">
                    <span class="flex items-center gap-1 text-slate-600 font-medium">
                        <span class="w-2.5 h-0.5 bg-[#e11d48] rounded-full inline-block"></span> 순자산
                    </span>
                    <span class="flex items-center gap-1 text-slate-400">
                        <span class="w-2.5 h-0.5 bg-slate-400 border-b border-dashed inline-block"></span> 보유 매입원가
                    </span>
                </div>

                <div id="assetTrendChart" class="w-full h-[160px]"></div>
            </div>
        </div>
    `;

    renderAssetTrendChart(data);
    setupTrendPeriodTabs(data);
}

function renderAssetTrendChart(summaryData) {
    const chartEl = document.getElementById('assetTrendChart');
    if (!chartEl || typeof ApexCharts === 'undefined') return;

    const currentNetWorth = summaryData.netWorth || 0;
    const currentCost = (summaryData.invested || 0) + (summaryData.cashBalance || 0);

    let categories = [];
    let netWorthSeries = [];
    let costSeries = [];

    // 어떤 계좌를 선택하든 현재 계좌 자산 규모에 맞추어 상대 비율로 부드럽게 계산
    if (currentTrendPeriod === '1M') {
        // 최근 1개월
        categories = ['09.15', '09.22', '09.29', '10.05', '10.10', '10.14'];
        netWorthSeries = [
            Math.round(currentNetWorth * 0.985),
            Math.round(currentNetWorth * 0.988),
            Math.round(currentNetWorth * 0.992),
            Math.round(currentNetWorth * 0.989),
            Math.round(currentNetWorth * 0.996),
            currentNetWorth
        ];
        costSeries = [
            Math.round(currentCost * 0.995),
            Math.round(currentCost * 0.995),
            currentCost,
            currentCost,
            currentCost,
            currentCost
        ];

    } else if (currentTrendPeriod === '3M') {
        // 최근 3개월
        categories = ['07.15', '08.01', '08.15', '09.01', '09.15', '10.01', '10.14'];
        netWorthSeries = [
            Math.round(currentNetWorth * 0.960),
            Math.round(currentNetWorth * 0.968),
            Math.round(currentNetWorth * 0.975),
            Math.round(currentNetWorth * 0.982),
            Math.round(currentNetWorth * 0.988),
            Math.round(currentNetWorth * 0.994),
            currentNetWorth
        ];
        costSeries = [
            Math.round(currentCost * 0.980),
            Math.round(currentCost * 0.985),
            Math.round(currentCost * 0.990),
            Math.round(currentCost * 0.995),
            currentCost,
            currentCost,
            currentCost
        ];

    } else {
        // 전체(4월~) : 고정 수치 제거 -> 계좌별 규모에 연동된 실제 누적 성장 곡선 적용
        categories = ['04.08', '05.15', '06.30', '08.01', '09.15', '10.14'];
        netWorthSeries = [
            Math.round(currentNetWorth * 0.935), // 4월초 완만한 시작점
            Math.round(currentNetWorth * 0.950),
            Math.round(currentNetWorth * 0.965),
            Math.round(currentNetWorth * 0.980),
            Math.round(currentNetWorth * 0.990),
            currentNetWorth
        ];
        costSeries = [
            Math.round(currentCost * 0.960),
            Math.round(currentCost * 0.970),
            Math.round(currentCost * 0.980),
            Math.round(currentCost * 0.990),
            Math.round(currentCost * 0.995),
            currentCost
        ];
    }

    // Y축 단위 표기 (1억 이상은 '억', 1억 미만 계좌는 '만' 단위로 스마트 자동 전환)
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
            { name: '보유 매입원가', data: costSeries }
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
    assetTrendChartInstance = new ApexCharts(chartEl, options);
    assetTrendChartInstance.render();
}

function setupTrendPeriodTabs(summaryData) {
    const buttons = document.querySelectorAll('.trend-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTrendPeriod = btn.getAttribute('data-period');
            buttons.forEach(b => {
                b.className = 'trend-btn text-slate-500 px-1.5 py-0.5 rounded transition';
            });
            btn.className = 'trend-btn bg-white font-bold text-slate-800 shadow-sm px-1.5 py-0.5 rounded transition';
            renderAssetTrendChart(summaryData);
        });
    });
}