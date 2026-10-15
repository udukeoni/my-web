// port/js/components/assetListTable.js

// 기존 고정 데이터 번호 기준선 (433번까지 고정 보호, 434번부터 수정/삭제 가능)
const BASE_FIXED_TRADE_ID = 433;

function renderDataTable(viewType, dataList) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    const badge = document.getElementById('dataCountBadge');
    const title = document.getElementById('tableTitle');

    if (!thead || !tbody || !mobileList) return;

    // 제목 영역 우측에 '+ 거래내역 입력' 버튼 동적 생성 및 제어
    const headerContainer = title ? title.closest('.flex.items-center.justify-between') : null;
    let btnOpenModal = document.getElementById('btnOpenTxModal');
    if (headerContainer && !btnOpenModal) {
        btnOpenModal = document.createElement('button');
        btnOpenModal.id = 'btnOpenTxModal';
        btnOpenModal.type = 'button';
        btnOpenModal.className = 'hidden items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-sm active:scale-95';
        btnOpenModal.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i> 거래내역 입력';
        headerContainer.appendChild(btnOpenModal);
    }

    // ==========================================
    // 1. 보유 종목 (HOLDINGS) 뷰
    // ==========================================
    if (viewType === 'HOLDINGS') {
        if (title) title.textContent = '보유 종목 상세';
        if (badge) badge.textContent = `${dataList ? dataList.length : 0}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

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

        if (btnOpenModal) {
            if (viewType === 'ALL_LOGS') {
                btnOpenModal.classList.remove('hidden');
                btnOpenModal.classList.add('inline-flex');
            } else {
                btnOpenModal.classList.add('hidden');
                btnOpenModal.classList.remove('inline-flex');
            }
        }

        thead.innerHTML = `
            <tr>
              <th class="py-3.5 px-4 whitespace-nowrap">거래일자</th>
              <th class="py-3.5 px-4 whitespace-nowrap">계좌</th>
              <th class="py-3.5 px-4 whitespace-nowrap">구분</th>
              <th class="py-3.5 px-4">종목</th>
              <th class="py-3.5 px-4 text-right whitespace-nowrap">수량</th>
              <th class="py-3.5 px-4 text-right whitespace-nowrap">단가</th>
              <th class="py-3.5 px-4 text-right whitespace-nowrap">정산금액</th>
              <th class="py-3.5 px-4 text-right whitespace-nowrap">세금</th>
              <th class="py-3.5 px-4">메모</th>
            </tr>
        `;

        if (!dataList || dataList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">기록된 거래 내역이 없습니다.</td></tr>`;
            mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-sm">기록된 거래 내역이 없습니다.</div>`;
            return;
        }

        tbody.innerHTML = dataList.map(item => {
            let badgeStyle = "bg-slate-100 text-slate-700";
            if (item.trade_type === '매수') badgeStyle = "bg-red-50 text-red-600";
            if (item.trade_type === '매도') badgeStyle = "bg-blue-50 text-blue-600";
            if (item.trade_type === '분배금' || item.trade_type === '배당금') badgeStyle = "bg-emerald-50 text-emerald-600";
            if (item.trade_type === '이자') badgeStyle = "bg-amber-50 text-amber-700";
            if (item.trade_type === '입금') badgeStyle = "bg-purple-50 text-purple-600";
            if (item.trade_type === '출금') badgeStyle = "bg-gray-100 text-gray-600";

            let itemDisplayName = item.display_asset_name || item.ticker;
            if (item.ticker === 'CASH') itemDisplayName = '원화 현금';
            else if (item.trade_type === '이자') itemDisplayName = `${item.account_name || item.account_id} 이자`;

            const isTransfer = (item.trade_type === '출금' || item.trade_type === '입금');
            const taxText = isTransfer ? '₩0' : ((item.tax || item.fee) ? '₩' + Number(item.tax || item.fee).toLocaleString() : '₩0');

            // 💡 433번 초과 건만 수정/삭제 허용 (파란 글씨 뱃지는 완전히 없애고 클릭 동작만 유지)
            const isEditable = item.trade_id && Number(item.trade_id) > BASE_FIXED_TRADE_ID;
            const cursorClass = isEditable ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50';
            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <tr class="transition border-b border-slate-100 ${cursorClass} ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                  <td class="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                    ${item.trade_date}
                  </td>
                  <td class="py-3.5 px-4 text-xs font-semibold text-slate-800 whitespace-nowrap">${item.account_name || item.account_id}</td>
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="px-2.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap inline-block ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900">${itemDisplayName}</div>
                    ${item.ticker !== 'CASH' && item.trade_type !== '이자' ? `<div class="text-[10px] text-slate-400 font-mono">${item.ticker}</div>` : ''}
                  </td>
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">${item.quantity ? Number(item.quantity).toLocaleString() + '주' : '-'}</td>
                  <td class="py-3.5 px-4 text-right whitespace-nowrap">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right text-xs text-slate-500 whitespace-nowrap">${taxText}</td>
                  <td class="py-3.5 px-4 text-xs text-slate-400">${item.memo || ''}</td>
                </tr>
            `;
        }).join('');

        // 모바일 카드 뷰
        mobileList.innerHTML = dataList.map(item => {
            let badgeStyle = "bg-slate-100 text-slate-700";
            if (item.trade_type === '매수') badgeStyle = "bg-red-50 text-red-600";
            if (item.trade_type === '매도') badgeStyle = "bg-blue-50 text-blue-600";
            if (item.trade_type === '분배금' || item.trade_type === '배당금') badgeStyle = "bg-emerald-50 text-emerald-600";
            if (item.trade_type === '이자') badgeStyle = "bg-amber-50 text-amber-700";
            if (item.trade_type === '입금') badgeStyle = "bg-purple-50 text-purple-600";
            if (item.trade_type === '출금') badgeStyle = "bg-gray-100 text-gray-600";

            let itemDisplayName = item.display_asset_name || item.ticker;
            if (item.ticker === 'CASH') itemDisplayName = '원화 현금';
            else if (item.trade_type === '이자') itemDisplayName = `${item.account_name || item.account_id} 이자`;

            const isTransfer = (item.trade_type === '출금' || item.trade_type === '입금');
            const mobileTaxText = (!isTransfer && (item.tax || item.fee)) ? '세금 ₩' + Number(item.tax || item.fee).toLocaleString() : '';

            const isEditable = item.trade_id && Number(item.trade_id) > BASE_FIXED_TRADE_ID;
            const cursorClass = isEditable ? 'cursor-pointer active:bg-blue-50/40' : '';
            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <div class="p-3.5 bg-white rounded-xl border border-slate-100 shadow-sm mb-2 text-xs ${cursorClass} ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                    <div class="flex justify-between items-center mb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-800">${item.account_name || item.account_id}</span>
                            <span class="px-2 py-0.5 rounded font-bold whitespace-nowrap ${badgeStyle}">${item.trade_type}</span>
                        </div>
                        <div class="font-mono text-slate-400">${item.trade_date}</div>
                    </div>
                    <div class="flex justify-between items-center font-medium my-1">
                        <span class="font-bold text-slate-900 text-sm">${itemDisplayName}</span>
                        <span class="text-sm font-extrabold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-50">
                        <span>${item.memo || '-'}</span>
                        <span>${mobileTaxText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}