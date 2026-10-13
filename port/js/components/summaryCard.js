// port/js/components/summaryCard.js

/**
 * [컴포넌트 렌더링] 상단 순자산 및 주식 평가 손익률 분리 렌더링
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
        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-slate-500 font-medium">총 순자산 (Net Worth)</span>
                </div>
                <div class="text-3xl font-extrabold text-slate-900 mb-1">
                    ₩${Number(data.netWorth || 0).toLocaleString()}
                </div>
                <div class="text-sm font-semibold ${profitColorClass}">
                    총자산 평가손익 ${sign}₩${Number(profitAmount).toLocaleString()} 
                    <span class="text-xs font-bold ml-0.5">(${sign}${netProfitRate}%)</span>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-2 pt-4 mt-4 border-t border-slate-100 text-sm">
                <div>
                    <span class="text-slate-400 block mb-0.5 text-xs">주식 평가금</span>
                    <span class="font-bold text-slate-800 text-xs sm:text-sm block">₩${Number(data.totalStockEval || 0).toLocaleString()}</span>
                    <span class="text-xs font-semibold ${profitColorClass}">수익률 ${sign}${stockProfitRate}%</span>
                </div>
                <div>
                    <span class="text-slate-400 block mb-0.5 text-xs">예수금 (현금)</span>
                    <span class="font-bold text-slate-800 text-xs sm:text-sm block">₩${Number(data.cashBalance || 0).toLocaleString()}</span>
                    <span class="text-xs text-slate-400 font-medium">현금 비중 ${data.cashWeight || 0}%</span>
                </div>
                <div>
                    <span class="text-slate-400 block mb-0.5 text-xs">총 매입원가</span>
                    <span class="font-semibold text-slate-800 text-xs sm:text-sm block">₩${Number(data.invested || 0).toLocaleString()}</span>
                    <span class="text-xs text-slate-400">주식 매입가</span>
                </div>
            </div>
        </div>
    `;
}