// port/js/components/treemapChart.js

let treemapInstance = null;

function renderTreemapChart(holdings) {
    const chartContainer = document.getElementById('treemapChart');
    if (!chartContainer) return;

    if (!holdings || holdings.length === 0) {
        chartContainer.innerHTML = `
            <div class="h-full flex items-center justify-center text-slate-400 text-sm">
                보유 주식이 없어 비중 차트를 표시할 수 없습니다.
            </div>`;
        return;
    }

    // 종목별 비중 계산 (총 주식 평가금액 대비)
    const totalEval = holdings.reduce((sum, h) => sum + (h.eval_amount || 0), 0);

    // 상위 종목들을 정리하고 나머지는 소형 타일로 구성
    const chartData = holdings.map(h => {
        const weight = totalEval > 0 ? Number(((h.eval_amount / totalEval) * 100).toFixed(1)) : 0;
        return {
            x: h.asset_name,
            y: weight,             // 타일 크기 (비중 %)
            profitRate: h.profit_rate || 0, // 수익률
            evalAmount: h.eval_amount || 0
        };
    });

    const options = {
        series: [{ data: chartData }],
        chart: {
            type: 'treemap',
            height: 260,
            toolbar: { show: false },
            fontFamily: 'Pretendard, sans-serif'
        },
        plotOptions: {
            treemap: {
                distributed: true,
                enableShades: false
            }
        },
        // 손익률에 따른 색상 지정 (양수: 따뜻한 연분홍/연빨강, 음수: 차분한 연하늘/연파랑)
        colors: chartData.map(d => {
            if (d.profitRate > 0) return '#fecdd3';      // rose-200 (수익)
            if (d.profitRate < -15) return '#bae6fd';    // sky-200 (큰 하락)
            if (d.profitRate < 0) return '#e0f2fe';      // sky-100 (하락)
            return '#f1f5f9';                            // slate-100 (보합)
        }),
        dataLabels: {
            enabled: true,
            style: {
                fontSize: '11px',
                fontWeight: 'bold',
                colors: chartData.map(d => d.profitRate >= 0 ? '#b91c1c' : '#0369a1')
            },
            formatter: function(text, op) {
                const item = chartData[op.dataPointIndex];
                if (!item) return text;
                const sign = item.profitRate >= 0 ? '+' : '';
                return [
                    text,
                    `${sign}${item.profitRate}%`,
                    `${item.y}%`
                ];
            },
            offsetY: -2
        },
        tooltip: {
            custom: function({ seriesIndex, dataPointIndex, w }) {
                const item = chartData[dataPointIndex];
                const sign = item.profitRate >= 0 ? '+' : '';
                const color = item.profitRate >= 0 ? 'text-red-400' : 'text-blue-400';
                return `
                    <div class="px-3 py-2 text-xs">
                        <div class="font-bold text-white mb-1">${item.x}</div>
                        <div class="text-slate-300">평가금액: ₩${Number(item.evalAmount).toLocaleString()}</div>
                        <div class="text-slate-300">포트 비중: ${item.y}%</div>
                        <div class="font-semibold ${color}">수익률: ${sign}${item.profitRate}%</div>
                    </div>
                `;
            }
        }
    };

    if (treemapInstance) {
        treemapInstance.destroy();
    }
    treemapInstance = new ApexCharts(chartContainer, options);
    treemapInstance.render();
}