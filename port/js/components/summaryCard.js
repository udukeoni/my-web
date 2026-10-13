// port/js/components/summaryCard.js

/**
 * [컴포넌트 렌더링] 상단 순자산 요약 화면 (배당금 항목 제외)
 * @param {Object} data - app.js에서 넘겨주는 summary 객체
 */
function renderSummaryCard(data) {
    const container = document.getElementById('summarySection');
    if (!container || !data) return;
    
    const profitAmount = data.profitAmount || 0;
    const profitRate = data.profitRate || 0;
    const isPositive = profitAmount >= 0;
    const profitColorClass = isPositive ? 'text-red-500' : 'text-blue-500';
    const sign = isPositive ? '+' : '';
    
    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm text-slate-500 font-medium">총 순자산 (Net Worth)</span>
                </div>
                <div class="text-3xl font-extrabold text-slate-900 mb-1">
                    ₩${Number(data.netWorth || 0).toLocaleString()}
                </div>
                <div class="text-sm font-semibold ${profitColorClass}">
                    총 평가손익 ${sign}₩${Number(profitAmount).toLocaleString()} (${sign}${profitRate}%)
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-2 pt-4 mt-4 border-t border-slate-100 text-sm">
                <div>
                    <span class="text-slate-400 block mb-1 text-xs">주식 평가금</span>
                    <span class="font-bold text-slate-800 text-xs sm:text-sm">₩${Number(data.totalStockEval || 0).toLocaleString()}</span>
                </div>
                <div>
                    <span class="text-slate-400 block mb-1 text-xs">예수금 (현금)</span>
                    <span class="font-bold text-slate-800 text-xs sm:text-sm">₩${Number(data.cashBalance || 0).toLocaleString()}</span>
                </div>
                <div>
                    <span class="text-slate-400 block mb-1 text-xs">총 매입원가</span>
                    <span class="font-semibold text-slate-800 text-xs sm:text-sm">₩${Number(data.invested || 0).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}