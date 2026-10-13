// port/js/components/summaryCard.js

/**
 * [컴포넌트 렌더링] 상단 순자산 요약 화면을 동적으로 그림.
 * @param {Object} data - app.js에서 넘겨주는 데이터
 */
function renderSummaryCard(data) {
    const container = document.getElementById('summarySection');
    
    // 수익률이 음수면 파란색(Tailwind의 blue-500), 양수면 빨간색 계열로 표시하기 위한 로직
    const profitColorClass = data.dailyProfit < 0 ? 'text-blue-500' : 'text-red-500';
    
    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow border h-full flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm text-gray-500 font-medium">순자산</span>
                </div>
                <div class="text-3xl font-extrabold mb-1">₩${data.netWorth.toLocaleString()}</div>
                <div class="text-sm font-medium ${profitColorClass}">
                    일간 손익 ₩${data.dailyProfit.toLocaleString()}
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-y-3 pt-4 mt-4 border-t border-gray-100 text-sm">
                <div>
                    <span class="text-gray-400 block mb-1">시가 배당률</span>
                    <span class="font-semibold text-gray-800">6.82%</span>
                </div>
                <div>
                    <span class="text-gray-400 block mb-1">연 배당금</span>
                    <span class="font-semibold text-emerald-600">₩${data.dividend.toLocaleString()}</span>
                </div>
                <div>
                    <span class="text-gray-400 block mb-1">매입원가</span>
                    <span class="font-semibold text-gray-800">₩111,142,221</span>
                </div>
                <div>
                    <span class="text-gray-400 block mb-1">예수금</span>
                    <span class="font-semibold text-emerald-600 cursor-pointer hover:underline">추가</span>
                </div>
            </div>
        </div>
    `;
}