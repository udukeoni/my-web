// port/js/components/assetListTable.js
// 스프레드시트형 콤팩트 고밀도 테이블 렌더러 (밴드리밸런싱 최적화)

const BASE_FIXED_TRADE_ID = 433; // 433번까지 고정 데이터 보호

// 페이징 상태 변수
let currentPage = 1;
// 💡 한 화면에서 전 종목을 스프레드시트처럼 볼 수 있도록 기본 노출 건수를 대폭 확대 (최대 50건)
let pageSize = 50; 
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
        // 보유 종목은 한눈에 다 보이도록 50개, 거래원장은 15개로 설정
        pageSize = (viewType === 'HOLDINGS') ? 50 : 15;
    }
    currentDataList = dataList || [];

    // 제목 영역 우측에 '+ 거래내역 입력' 버튼 동적 제어
    const headerContainer = title ? title.closest('.flex.items-center.justify-between') : null;
    let btnOpenModal = document.getElementById('btnOpenTxModal');
    if (headerContainer && !btnOpenModal) {
        btnOpenModal = document.createElement('button');
        btnOpenModal.id = 'btnOpenTxModal';
        btnOpenModal.type = 'button';
        btnOpenModal.className = 'hidden items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-md transition shadow-sm active:scale-95';
        btnOpenModal.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i> 거래내역 입력';
        headerContainer.appendChild(btnOpenModal);
    }

    // ==========================================
    // 1. 보유 종목 (HOLDINGS) 스프레드시트형 콤팩트 헤더
    // ==========================================
    if (viewType === 'HOLDINGS') {
        if (title) title.textContent = '보유 종목 상세 (포트폴리오 비중)';
        if (badge) badge.textContent = `${currentDataList.length}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

        thead.innerHTML = `
            <tr class="bg-slate-100/90 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none">
              <th class="py-1.5 px-3 whitespace-nowrap text-left">종목명</th>
              <th class="py-1.5 px-2 whitespace-nowrap text-center">코드</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">매수평균가</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">현재가</th>
              <th class="py-1.5 px-2 whitespace-nowrap text-right">수량</th>
              <th class="py-1.5 px-3 whitespace-nowrap text-right bg-slate-200/50">평가금액</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right bg-blue-50/60 text-blue-800">비중</th>
              <th class="py-1.5 px-3 whitespace-nowrap text-right">평가손익</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">수익률</th>
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
            <tr class="bg-slate-100/90 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none">
              <th class="py-1.5 px-3 whitespace-nowrap text-left">거래일자</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-left">계좌</th>
              <th class="py-1.5 px-2 whitespace-nowrap text-center">구분</th>
              <th class="py-1.5 px-3 whitespace-nowrap text-left">종목</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">수량</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">단가</th>
              <th class="py-1.5 px-3 whitespace-nowrap text-right">정산금액</th>
              <th class="py-1.5 px-2.5 whitespace-nowrap text-right">세금</th>
              <th class="py-1.5 px-3 text-left">메모</th>
            </tr>
        `;
    }

    renderPaginatedRows();
    updatePaginationControls();
}

// 스프레드시트형 초슬림 본문 출력 함수
function renderPaginatedRows() {
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    if (!tbody || !mobileList) return;

    if (!currentDataList || currentDataList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400 text-xs">데이터가 없습니다.</td></tr>`;
        mobileList.innerHTML = `<div class="py-6 text-center text-slate-400 text-xs">데이터가 없습니다.</div>`;
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = currentDataList.slice(startIndex, startIndex + pageSize);

    if (currentViewType === 'HOLDINGS') {
        // [스프레드시트형 1행 1종목 콤팩트 그리드]
        tbody.innerHTML = pageItems.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
            const sign = isPositive ? '+' : '';

            return `
                <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight">
                  <!-- 1. 종목명 (한 줄 유지) -->
                  <td class="py-1.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                    ${item.asset_name}
                  </td>
                  <!-- 2. 종목코드 -->
                  <td class="py-1.5 px-2 text-center font-mono text-[10px] text-slate-400 whitespace-nowrap">
                    ${item.ticker}
                  </td>
                  <!-- 3. 매수평균가 -->
                  <td class="py-1.5 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                    ₩${Number(item.avg_buy_price).toLocaleString()}
                  </td>
                  <!-- 4. 현재가 -->
                  <td class="py-1.5 px-2.5 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                    ₩${Number(item.current_price).toLocaleString()}
                  </td>
                  <!-- 5. 보유수량 -->
                  <td class="py-1.5 px-2 text-right font-mono text-slate-700 whitespace-nowrap">
                    ${Number(item.quantity).toLocaleString()}
                  </td>
                  <!-- 6. 현재평가금액 (강조 셀) -->
                  <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/60 whitespace-nowrap">
                    ₩${Number(item.eval_amount).toLocaleString()}
                  </td>
                  <!-- 7. 비중 (스프레드시트 밴드 확인용 강조) -->
                  <td class="py-1.5 px-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/30 whitespace-nowrap">
                    ${item.weight}%
                  </td>
                  <!-- 8. 평가손익 -->
                  <td class="py-1.5 px-3 text-right font-mono font-semibold ${profitColor} whitespace-nowrap">
                    ${sign}₩${Number(item.profit_amount).toLocaleString()}
                  </td>
                  <!-- 9. 손익률 -->
                  <td class="py-1.5 px-2.5 text-right font-mono font-bold ${profitColor} whitespace-nowrap">
                    ${sign}${item.profit_rate}%
                  </td>
                </tr>
            `;
        }).join('');

        // 모바일 카드 뷰도 슬림하게 압축
        mobileList.innerHTML = pageItems.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <div class="py-2 px-2.5 bg-white border-b border-slate-100 text-xs">
                    <div class="flex justify-between items-center mb-1">
                        <div class="font-bold text-slate-900 truncate max-w-[190px]">${item.asset_name}</div>
                        <div class="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">${item.weight}%</div>
                    </div>
                    <div class="flex justify-between items-center text-[11px] text-slate-600">
                        <span>평가 ₩${Number(item.eval_amount).toLocaleString()} (${Number(item.quantity).toLocaleString()}주)</span>
                        <span class="font-bold ${profitColor}">${sign}${item.profit_rate}% (${sign}₩${Number(item.profit_amount).toLocaleString()})</span>
                    </div>
                </div>
            `;
        }).join('');

    } else {
        // [원장 거래 내역 본문 - 슬림 콤팩트]
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
                <tr class="transition border-b border-slate-100 text-[11px] leading-tight ${cursorClass} ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                  <td class="py-1.5 px-3 font-mono text-slate-600 whitespace-nowrap">${item.trade_date}</td>
                  <td class="py-1.5 px-2.5 font-medium text-slate-800 whitespace-nowrap">${item.account_name || item.account_id}</td>
                  <td class="py-1.5 px-2 text-center whitespace-nowrap">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap inline-block ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-1.5 px-3">
                    <div class="font-bold text-slate-900 whitespace-nowrap">${itemDisplayName}</div>
                  </td>
                  <td class="py-1.5 px-2.5 text-right font-mono whitespace-nowrap">${item.quantity ? Number(item.quantity).toLocaleString() : '-'}</td>
                  <td class="py-1.5 px-2.5 text-right font-mono whitespace-nowrap">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-1.5 px-2.5 text-right font-mono text-slate-500 whitespace-nowrap">${taxText}</td>
                  <td class="py-1.5 px-3 text-slate-400 truncate max-w-[140px] whitespace-nowrap">${item.memo || ''}</td>
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
                <div class="py-2 px-2.5 bg-white border-b border-slate-100 text-xs ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-800">${item.account_name || item.account_id}</span>
                            <span class="px-1.5 py-0.5 rounded font-bold text-[10px] whitespace-nowrap ${badgeStyle}">${item.trade_type}</span>
                        </div>
                        <div class="font-mono text-slate-400 text-[10px]">${item.trade_date}</div>
                    </div>
                    <div class="flex justify-between items-center font-medium">
                        <span class="font-bold text-slate-900">${itemDisplayName}</span>
                        <span class="font-mono font-bold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</span>
                    </div>
                    <div class="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-50 mt-1">
                        <span>${item.memo || '-'}</span>
                        <span>${mobileTaxText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// 하단 페이징 버튼 및 셀렉트 박스 제어
function updatePaginationControls() {
    const totalPages = Math.ceil(currentDataList.length / pageSize) || 1;
    const select = document.getElementById('selectPage');
    const totalText = document.getElementById('totalPageText');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    const paginationBar = document.getElementById('paginationBar');

    if (!select || !totalText || !btnPrev || !btnNext) return;

    // 보유종목에서 한 페이지에 모두 담기면 페이징바 텍스트를 직관적으로 조정
    if (currentViewType === 'HOLDINGS' && totalPages === 1) {
        if (paginationBar) {
            const pageInfoText = paginationBar.querySelector('.flex.items-center.gap-1\\.5 span');
            if (pageInfoText) pageInfoText.textContent = `전체 ${currentDataList.length}개 종목 한눈에 보기`;
        }
    } else if (paginationBar) {
        const pageInfoText = paginationBar.querySelector('.flex.items-center.gap-1\\.5 span');
        if (pageInfoText) pageInfoText.textContent = `페이지당 ${pageSize}건`;
    }

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
            const maxPage = Math.ceil(currentDataList.length / pageSize) || 1;
            if (currentPage < maxPage) {
                currentPage++;
                renderPaginatedRows();
                updatePaginationControls();
            }
        });
    }
}