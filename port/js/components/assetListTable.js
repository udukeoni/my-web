// port/js/components/assetListTable.js

const BASE_FIXED_TRADE_ID = 433; // 433번까지 고정 데이터 보호

// 페이징 상태 변수
let currentPage = 1;
const PAGE_SIZE = 6; // 한 화면에 딱 맞게 6건씩 고정
let currentViewType = 'HOLDINGS';
let currentDataList = [];

function renderDataTable(viewType, dataList) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    const badge = document.getElementById('dataCountBadge');
    const title = document.getElementById('tableTitle');

    if (!thead || !tbody || !mobileList) return;

    // 탭이 바뀌면 1페이지로 리셋
    if (currentViewType !== viewType) {
        currentPage = 1;
        currentViewType = viewType;
    }
    currentDataList = dataList || [];

    // 제목 영역 우측에 '+ 거래내역 입력' 버튼 동적 제어
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
    // 1. 보유 종목 (HOLDINGS) 헤더 세팅
    // ==========================================
    if (viewType === 'HOLDINGS') {
        if (title) title.textContent = '보유 종목 상세';
        if (badge) badge.textContent = `${currentDataList.length}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

        thead.innerHTML = `
            <tr>
              <th class="py-2.5 px-4">종목명 / 계좌</th>
              <th class="py-2.5 px-4 text-right">매수평균가</th>
              <th class="py-2.5 px-4 text-right">현재가</th>
              <th class="py-2.5 px-4 text-right">보유수량</th>
              <th class="py-2.5 px-4 text-right">평가금액 (비중)</th>
              <th class="py-2.5 px-4 text-right">평가손익</th>
              <th class="py-2.5 px-4 text-right">수익률</th>
            </tr>
        `;

    // ==========================================
    // 2. 거래원장 헤더 세팅
    // ==========================================
    } else {
        const titles = {
            ALL_LOGS: '전체 거래 내역',
            TRADE: '매수 / 매도 내역',
            DIVIDEND: '분배금 내역',
            TRANSFER: '입금 / 출금 / 이자 내역'
        };
        if (title) title.textContent = titles[viewType] || '원장 거래 내역';
        if (badge) badge.textContent = `${currentDataList.length}건`;

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
              <th class="py-2.5 px-4 whitespace-nowrap">거래일자</th>
              <th class="py-2.5 px-4 whitespace-nowrap">계좌</th>
              <th class="py-2.5 px-4 whitespace-nowrap">구분</th>
              <th class="py-2.5 px-4">종목</th>
              <th class="py-2.5 px-4 text-right whitespace-nowrap">수량</th>
              <th class="py-2.5 px-4 text-right whitespace-nowrap">단가</th>
              <th class="py-2.5 px-4 text-right whitespace-nowrap">정산금액</th>
              <th class="py-2.5 px-4 text-right whitespace-nowrap">세금</th>
              <th class="py-2.5 px-4">메모</th>
            </tr>
        `;
    }

    // 💡 페이징 적용하여 현재 페이지의 6건만 렌더링
    renderPaginatedRows();
    updatePaginationControls();
}

// 6건 슬라이스 및 본문 출력 함수
function renderPaginatedRows() {
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    if (!tbody || !mobileList) return;

    if (!currentDataList || currentDataList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">데이터가 없습니다.</td></tr>`;
        mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-sm">데이터가 없습니다.</div>`;
        return;
    }

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = currentDataList.slice(startIndex, startIndex + PAGE_SIZE);

    if (currentViewType === 'HOLDINGS') {
        // [종목 잔고 본문]
        tbody.innerHTML = pageItems.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                  <td class="py-2.5 px-4">
                    <div class="font-bold text-slate-900 leading-tight">${item.asset_name}</div>
                    <div class="text-[11px] text-slate-400">${item.ticker} · ${item.account_name}</div>
                  </td>
                  <td class="py-2.5 px-4 text-right font-mono text-xs">₩${Number(item.avg_buy_price).toLocaleString()}</td>
                  <td class="py-2.5 px-4 text-right font-mono text-xs font-medium">₩${Number(item.current_price).toLocaleString()}</td>
                  <td class="py-2.5 px-4 text-right font-mono text-xs">${Number(item.quantity).toLocaleString()}주</td>
                  <td class="py-2.5 px-4 text-right">
                    <div class="font-bold text-xs">₩${Number(item.eval_amount).toLocaleString()}</div>
                    <div class="text-[10px] text-slate-400">비중 ${item.weight}%</div>
                  </td>
                  <td class="py-2.5 px-4 text-right font-bold text-xs ${profitColor}">
                    ${sign}₩${Number(item.profit_amount).toLocaleString()}
                  </td>
                  <td class="py-2.5 px-4 text-right font-bold text-xs ${profitColor}">
                    ${sign}${item.profit_rate}%
                  </td>
                </tr>
            `;
        }).join('');

        mobileList.innerHTML = pageItems.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm mb-2 text-xs">
                    <div class="flex justify-between items-start mb-1.5">
                        <div>
                            <div class="font-bold text-slate-900">${item.asset_name}</div>
                            <div class="text-[11px] text-slate-400">${item.ticker} · ${item.account_name}</div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-slate-900">₩${Number(item.eval_amount).toLocaleString()}</div>
                            <div class="text-[11px] font-bold ${profitColor}">${sign}${item.profit_rate}%</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-50 text-[11px] text-slate-500">
                        <div>매수 ₩${Number(item.avg_buy_price).toLocaleString()}</div>
                        <div>현재 ₩${Number(item.current_price).toLocaleString()}</div>
                        <div class="text-right">${Number(item.quantity).toLocaleString()}주 (${item.weight}%)</div>
                    </div>
                </div>
            `;
        }).join('');

    } else {
        // [원장 거래 내역 본문]
        tbody.innerHTML = pageItems.map(item => {
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

            const isEditable = item.trade_id && Number(item.trade_id) > BASE_FIXED_TRADE_ID;
            const cursorClass = isEditable ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50';
            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <tr class="transition border-b border-slate-100 ${cursorClass} ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                  <td class="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">${item.trade_date}</td>
                  <td class="py-2.5 px-4 text-xs font-semibold text-slate-800 whitespace-nowrap">${item.account_name || item.account_id}</td>
                  <td class="py-2.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap inline-block ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="font-bold text-slate-900 text-xs">${itemDisplayName}</div>
                    ${item.ticker !== 'CASH' && item.trade_type !== '이자' ? `<div class="text-[10px] text-slate-400 font-mono">${item.ticker}</div>` : ''}
                  </td>
                  <td class="py-2.5 px-4 text-right font-mono text-xs whitespace-nowrap">${item.quantity ? Number(item.quantity).toLocaleString() + '주' : '-'}</td>
                  <td class="py-2.5 px-4 text-right font-mono text-xs whitespace-nowrap">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-2.5 px-4 text-right font-bold text-slate-900 text-xs whitespace-nowrap">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-2.5 px-4 text-right text-xs text-slate-500 whitespace-nowrap">${taxText}</td>
                  <td class="py-2.5 px-4 text-xs text-slate-400 truncate max-w-[120px]">${item.memo || ''}</td>
                </tr>
            `;
        }).join('');

        mobileList.innerHTML = pageItems.map(item => {
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
            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm mb-2 text-xs ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-800">${item.account_name || item.account_id}</span>
                            <span class="px-2 py-0.5 rounded font-bold text-[10px] whitespace-nowrap ${badgeStyle}">${item.trade_type}</span>
                        </div>
                        <div class="font-mono text-slate-400 text-[11px]">${item.trade_date}</div>
                    </div>
                    <div class="flex justify-between items-center font-medium my-0.5">
                        <span class="font-bold text-slate-900">${itemDisplayName}</span>
                        <span class="font-extrabold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</span>
                    </div>
                    <div class="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-50">
                        <span>${item.memo || '-'}</span>
                        <span>${mobileTaxText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// 하단 페이징 버튼 및 셀렉트 박스 갱신 및 이벤트
function updatePaginationControls() {
    const totalPages = Math.ceil(currentDataList.length / PAGE_SIZE) || 1;
    const select = document.getElementById('selectPage');
    const totalText = document.getElementById('totalPageText');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (!select || !totalText || !btnPrev || !btnNext) return;

    totalText.textContent = `/ ${totalPages} 페이지`;
    select.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === currentPage) opt.selected = true;
        select.appendChild(opt);
    }

    btnPrev.disabled = (currentPage <= 1);
    btnNext.disabled = (currentPage >= totalPages);

    // 이벤트 리스너 (중복 바인딩 방지 플래그 적용)
    if (!select.dataset.bound) {
        select.dataset.bound = "true";
        select.addEventListener('change', (e) => {
            currentPage = Number(e.target.value);
            renderPaginatedRows();
            updatePaginationControls();
        });

        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPaginatedRows();
                updatePaginationControls();
            }
        });

        btnNext.addEventListener('click', () => {
            const maxPage = Math.ceil(currentDataList.length / PAGE_SIZE) || 1;
            if (currentPage < maxPage) {
                currentPage++;
                renderPaginatedRows();
                updatePaginationControls();
            }
        });
    }
}