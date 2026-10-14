// port/js/components/assetListTable.js

function renderDataTable(viewType, dataList) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    const badge = document.getElementById('dataCountBadge');
    const title = document.getElementById('tableTitle');

    if (!thead || !tbody || !mobileList) return;

    // ==========================================
    // 1. 보유 종목 (HOLDINGS) 뷰
    // ==========================================
    if (viewType === 'HOLDINGS') {
        if (title) title.textContent = '보유 종목 상세';
        if (badge) badge.textContent = `${dataList ? dataList.length : 0}종목`;

        // (1) 데스크톱 테이블 헤더
        thead.innerHTML = `
            <tr>
              <th class="py-3.5 px-4">종목명 / 계좌</th>
              <th class="py-3.5 px-4 text-right">매수평균가</th>
              <th class="py-3.5 px-4 text-right">현재가</th>
              <th class="py-3.5 px-4 text-right">보유수량</th>
              <th class="py-3.5 px-4 text-right">평가금액 (비중)</th>
              <th class="py-3.5 px-4 text-right">평가손익</th>
              <th class="py-3.5 px-4 text-right">수익률</th>
            </tr>
        `;

        if (!dataList || dataList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">보유 종목이 없습니다.</td></tr>`;
            mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-sm">보유 종목이 없습니다.</div>`;
            return;
        }

        // (2) 데스크톱 테이블 본문
        tbody.innerHTML = dataList.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900">${item.asset_name}</div>
                    <div class="text-xs text-slate-400">${item.ticker} · ${item.account_name} · ${item.sector || ''}</div>
                  </td>
                  <td class="py-3.5 px-4 text-right">₩${Number(item.avg_buy_price).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right font-medium">₩${Number(item.current_price).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right">${Number(item.quantity).toLocaleString()}주</td>
                  <td class="py-3.5 px-4 text-right">
                    <div class="font-bold">₩${Number(item.eval_amount).toLocaleString()}</div>
                    <div class="text-xs text-slate-400">비중 ${item.weight}%</div>
                  </td>
                  <td class="py-3.5 px-4 text-right font-bold ${profitColor}">
                    ${sign}₩${Number(item.profit_amount).toLocaleString()}
                  </td>
                  <td class="py-3.5 px-4 text-right font-bold ${profitColor}">
                    ${sign}${item.profit_rate}%
                  </td>
                </tr>
            `;
        }).join('');

        // (3) 모바일 맞춤 카드 뷰 (오른쪽 잘림 없이 100% 폭에 맞춤)
        mobileList.innerHTML = dataList.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm mb-2.5">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="font-bold text-slate-900 text-sm leading-tight">${item.asset_name}</div>
                            <div class="text-xs text-slate-400 mt-0.5">${item.ticker} · ${item.account_name}</div>
                        </div>
                        <div class="text-right">
                            <div class="font-extrabold text-slate-900 text-sm">₩${Number(item.eval_amount).toLocaleString()}</div>
                            <div class="text-xs font-bold ${profitColor}">${sign}${item.profit_rate}% (${sign}₩${Number(item.profit_amount).toLocaleString()})</div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-1 pt-2.5 mt-2 border-t border-slate-50 text-xs text-slate-500 bg-slate-50/70 p-2 rounded-lg">
                        <div>
                            <span class="text-slate-400 block text-[10px]">매수가</span>
                            <span class="font-semibold text-slate-700">₩${Number(item.avg_buy_price).toLocaleString()}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[10px]">현재가</span>
                            <span class="font-semibold text-slate-700">₩${Number(item.current_price).toLocaleString()}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-slate-400 block text-[10px]">보유(비중)</span>
                            <span class="font-semibold text-slate-700">${Number(item.quantity).toLocaleString()}주 (${item.weight}%)</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    // ==========================================
    // 2. 거래원장 (전체/매매/분배/입출금) 뷰
    // ==========================================
    } else {
        const titles = {
            ALL_LOGS: '전체 거래 내역',
            TRADE: '매수 / 매도 내역',
            DIVIDEND: '분배금 내역',
            TRANSFER: '입금 / 출금 / 이자 내역'
        };
        if (title) title.textContent = titles[viewType] || '원장 거래 내역';
        if (badge) badge.textContent = `${dataList ? dataList.length : 0}건`;

        // (1) 데스크톱 헤더
        thead.innerHTML = `
            <tr>
              <th class="py-3.5 px-4">거래일자</th>
              <th class="py-3.5 px-4">구분</th>
              <th class="py-3.5 px-4">계좌</th>
              <th class="py-3.5 px-4">종목코드 / 대상ID</th>
              <th class="py-3.5 px-4 text-right">수량</th>
              <th class="py-3.5 px-4 text-right">단가</th>
              <th class="py-3.5 px-4 text-right">정산금액</th>
              <th class="py-3.5 px-4 text-right">세금</th>
              <th class="py-3.5 px-4">메모</th>
            </tr>
        `;

        if (!dataList || dataList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">기록된 거래 내역이 없습니다.</td></tr>`;
            mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-sm">기록된 거래 내역이 없습니다.</div>`;
            return;
        }

        // (2) 데스크톱 본문
        tbody.innerHTML = dataList.map(item => {
            let badgeStyle = "bg-slate-100 text-slate-700";
            if (item.trade_type === '매수') badgeStyle = "bg-red-50 text-red-600";
            if (item.trade_type === '매도') badgeStyle = "bg-blue-50 text-blue-600";
            if (item.trade_type === '분배금') badgeStyle = "bg-emerald-50 text-emerald-600";
            if (item.trade_type === '이자') badgeStyle = "bg-amber-50 text-amber-700";
            if (item.trade_type === '입금') badgeStyle = "bg-purple-50 text-purple-600";
            if (item.trade_type === '출금') badgeStyle = "bg-gray-100 text-gray-600";

            let tickerDisplay = `<span class="font-bold text-slate-800">${item.ticker}</span>`;
            if (item.ticker === 'CASH') {
                tickerDisplay = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono text-xs font-bold tracking-wider">CASH</span>`;
            } else if (item.trade_type === '이자') {
                tickerDisplay = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono text-xs font-semibold">${item.ticker}</span>`;
            }

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                  <td class="py-3.5 px-4 font-mono text-xs text-slate-600">${item.trade_date}</td>
                  <td class="py-3.5 px-4">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-3.5 px-4 text-xs font-medium text-slate-700">${item.account_id}</td>
                  <td class="py-3.5 px-4">${tickerDisplay}</td>
                  <td class="py-3.5 px-4 text-right">${item.quantity ? Number(item.quantity).toLocaleString() + '주' : '-'}</td>
                  <td class="py-3.5 px-4 text-right">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-3.5 px-4 text-right font-bold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right text-xs text-slate-500">${item.tax ? '₩' + Number(item.tax).toLocaleString() : '₩0'}</td>
                  <td class="py-3.5 px-4 text-xs text-slate-400">${item.memo || ''}</td>
                </tr>
            `;
        }).join('');

        // (3) 모바일 원장 카드 뷰
        mobileList.innerHTML = dataList.map(item => {
            let badgeStyle = "bg-slate-100 text-slate-700";
            if (item.trade_type === '매수') badgeStyle = "bg-red-50 text-red-600";
            if (item.trade_type === '매도') badgeStyle = "bg-blue-50 text-blue-600";
            if (item.trade_type === '분배금') badgeStyle = "bg-emerald-50 text-emerald-600";
            if (item.trade_type === '이자') badgeStyle = "bg-amber-50 text-amber-700";
            if (item.trade_type === '입금') badgeStyle = "bg-purple-50 text-purple-600";

            return `
                <div class="p-3.5 bg-white rounded-xl border border-slate-100 shadow-sm mb-2 text-xs">
                    <div class="flex justify-between items-center mb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="px-2 py-0.5 rounded font-bold ${badgeStyle}">${item.trade_type}</span>
                            <span class="font-bold text-slate-800">${item.ticker}</span>
                        </div>
                        <div class="font-mono text-slate-400">${item.trade_date}</div>
                    </div>
                    <div class="flex justify-between items-center font-medium my-1">
                        <span class="text-slate-500">${item.account_id}</span>
                        <span class="text-sm font-extrabold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-50">
                        <span>${item.memo || '-'}</span>
                        <span>${item.tax ? '세금 ₩' + Number(item.tax).toLocaleString() : ''}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}