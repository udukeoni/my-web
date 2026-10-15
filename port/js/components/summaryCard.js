// port/js/components/summaryCard.js

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
        <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col justify-center">
            <!-- 총순자산 및 3대 지표 (주식평가금, 예수금, 총매입원가) -->
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs text-slate-500 font-medium">총 순자산 (Net Worth)</span>
                    <span class="text-[11px] text-slate-400">자산 손익률 <b class="${profitColorClass}">${sign}${netProfitRate}%</b></span>
                </div>
                <div class="flex items-baseline gap-2 mb-3">
                    <div class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        ₩${Number(data.netWorth || 0).toLocaleString()}
                    </div>
                    <div class="text-xs font-semibold ${profitColorClass}">
                        ${sign}₩${Number(profitAmount).toLocaleString()}
                    </div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 py-3 px-3 bg-slate-50/80 rounded-lg text-xs border border-slate-100">
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
        </div>
    `;
}