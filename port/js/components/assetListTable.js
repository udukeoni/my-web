// port/js/components/assetListTable.js
// 스프레드시트형 밴드리밸런싱 고밀도 뷰어 (10건 자동 페이지네이션 지원)

const BASE_FIXED_TRADE_ID = 433; // 433번까지 고정 데이터 보호

let currentPage = 1;
let pageSize = 10; // 요청사항 반영: 종목 10개 단위로 자동 커트하여 페이지 분할
let currentViewType = 'HOLDINGS';
let currentDataList = [];

function renderDataTable(viewType, dataList) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    const badge = document.getElementById('dataCountBadge');
    const title = document.getElementById('tableTitle');

    if (!thead || !tbody || !mobileList) return;

    if (currentViewType !== viewType) {
        currentPage = 1;
        currentViewType = viewType;
    }
    // 종목 잔고 및 원장 공통 10건 단위 페이징 통일
    pageSize = 10;
    currentDataList = dataList || [];

    // 거래내역 입력 버튼 제어
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
    // 1. 보유 종목 (HOLDINGS) 헤더 - 밴드리밸런싱 감지 분기
    // ==========================================
    if (viewType === 'HOLDINGS') {
        const hasRebalance = currentDataList.some(item => item.target_weight !== null && item.target_weight !== undefined);

        if (title) title.textContent = hasRebalance ? '자산배분 밴드리밸런싱 포트폴리오' : '보유 종목 상세';
        if (badge) badge.textContent = `${currentDataList.length}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

        if (hasRebalance) {
            // [구글 스프레드시트 완전 동일] 밴드리밸런싱 전용 와이드 헤더
            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2 text-right">수량</th>
                  <th class="py-2 px-2.5 text-right">매수평균가</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  <th class="py-2 px-2.5 text-right">손익률</th>
                  <th class="py-2 px-2.5 text-right bg-blue-50/70 text-blue-900 border-l border-blue-100">현재비중</th>
                  <th class="py-2 px-2 text-right bg-emerald-50/70 text-emerald-900">목표비중</th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드하한</th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드상한</th>
                  <th class="py-2 px-2.5 text-center bg-slate-200/60">상태 확인</th>
                  <th class="py-2 px-3 text-right bg-amber-50/70 text-amber-900 border-l border-amber-100">매수/매도액</th>
                  <th class="py-2 px-2.5 text-right bg-amber-50/70 text-amber-900">조정 주식 수</th>
                </tr>
            `;
        } else {
            // 일반 계좌용 콤팩트 헤더
            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2.5 text-right">매수평균가</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-2 text-right">수량</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  <th class="py-2 px-2.5 text-right bg-blue-50/60 text-blue-800">비중</th>
                  <th class="py-2 px-3 text-right">평가손익</th>
                  <th class="py-2 px-2.5 text-right">수익률</th>
                </tr>
            `;
        }

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
            <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
              <th class="py-2 px-3 text-left">거래일자</th>
              <th class="py-2 px-2.5 text-left">계좌</th>
              <th class="py-2 px-2 text-center">구분</th>
              <th class="py-2 px-3 text-left">종목</th>
              <th class="py-2 px-2.5 text-right">수량</th>
              <th class="py-2 px-2.5 text-right">단가</th>
              <th class="py-2 px-3 text-right">정산금액</th>
              <th class="py-2 px-2.5 text-right">세금</th>
              <th class="py-2 px-3 text-left">메모</th>
            </tr>
        `;
    }

    renderPaginatedRows();
    updatePaginationControls();
}

function renderPaginatedRows() {
    const tbody = document.getElementById('tableBody');
    const mobileList = document.getElementById('mobileCardList');
    if (!tbody || !mobileList) return;

    if (!currentDataList || currentDataList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="py-8 text-center text-slate-400 text-xs">데이터가 없습니다.</td></tr>`;
        mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">데이터가 없습니다.</div>`;
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = currentDataList.slice(startIndex, startIndex + pageSize);

    if (currentViewType === 'HOLDINGS') {
        const hasRebalance = currentDataList.some(item => item.target_weight !== null && item.target_weight !== undefined);

        if (hasRebalance) {
            // [밴드리밸런싱 본문 렌더링]
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                // 상태 뱃지 스타일
                let statusBadge = '<span class="text-slate-400">-</span>';
                if (item.rebalance_status === '유지') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 유지</span>';
                } else if (item.rebalance_status === '매수') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">🔵 매수</span>';
                } else if (item.rebalance_status === '매도') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">🔴 매도</span>';
                }

                // 조정 수량 및 금액 표기
                const diffAmt = Number(item.diff_amount || 0);
                const diffSign = diffAmt > 0 ? '+' : '';
                const diffColor = diffAmt > 0 ? 'text-blue-600 font-bold' : (diffAmt < 0 ? 'text-rose-600 font-bold' : 'text-slate-500');

                const adjShares = Number(item.adjust_shares || 0);
                const adjSign = adjShares > 0 ? '+' : '';
                const adjText = (item.isCash || !item.current_price) ? '-' : `${adjSign}${adjShares.toLocaleString()}주`;

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-700">${item.isCash ? '1' : Number(item.quantity).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Number(item.avg_buy_price).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-800">₩${Number(item.current_price).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/70">₩${Number(item.eval_amount).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${profitColor}">${item.isCash ? '0.00%' : `${sign}${item.profit_rate}%`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-l border-blue-50">${item.weight}%</td>
                      <td class="py-2 px-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">${item.target_weight !== null ? item.target_weight + '%' : '-'}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-500">${item.band_min !== null ? item.band_min.toFixed(2) + '%' : '-'}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-500">${item.band_max !== null ? item.band_max.toFixed(2) + '%' : '-'}</td>
                      <td class="py-2 px-2.5 text-center bg-slate-50/60">${statusBadge}</td>
                      <td class="py-2 px-3 text-right font-mono ${diffColor} bg-amber-50/20 border-l border-amber-50">${diffAmt !== 0 ? `${diffSign}₩${Math.abs(diffAmt).toLocaleString()}` : '₩0'}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${diffColor} bg-amber-50/20">${adjText}</td>
                    </tr>
                `;
            }).join('');

            // 모바일용 밴드리밸런싱 전용 요약 카드
            mobileList.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
                const sign = isPositive ? '+' : '';

                let statusBadge = '<span class="text-slate-400 text-[10px]">-</span>';
                if (item.rebalance_status === '유지') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">✅ 유지</span>';
                } else if (item.rebalance_status === '매수') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">🔵 매수 권장</span>';
                } else if (item.rebalance_status === '매도') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">🔴 매도 권장</span>';
                }

                const diffAmt = Number(item.diff_amount || 0);
                const diffSign = diffAmt > 0 ? '+' : '';
                const diffColor = diffAmt > 0 ? 'text-blue-600' : (diffAmt < 0 ? 'text-rose-600' : 'text-slate-500');
                const adjText = (item.isCash || !item.current_price) ? '' : `(${item.adjust_shares > 0 ? '+' : ''}${item.adjust_shares}주)`;

                return `
                    <div class="py-2.5 px-3 bg-white border-b border-slate-100 text-xs">
                        <div class="flex justify-between items-center mb-1.5">
                            <div class="font-bold text-slate-900 truncate max-w-[190px]">${item.asset_name}</div>
                            <div>${statusBadge}</div>
                        </div>
                        <div class="flex justify-between items-center text-[11px] mb-1">
                            <span class="text-slate-500">평가 ₩${Number(item.eval_amount).toLocaleString()} (${item.weight}%)</span>
                            <span class="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">목표 ${item.target_weight || '-'}%</span>
                        </div>
                        <div class="flex justify-between items-center text-[11px] pt-1 border-t border-slate-50">
                            <span class="text-slate-400">밴드 ${item.band_min || 0}% ~ ${item.band_max || 0}%</span>
                            <span class="font-bold ${diffColor}">조정 ${diffSign}₩${Number(diffAmt).toLocaleString()} ${adjText}</span>
                        </div>
                    </div>
                `;
            }).join('');

        } else {
            // [일반 계좌 콤팩트 본문]
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Number(item.avg_buy_price).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-800">₩${Number(item.current_price).toLocaleString()}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-700">${item.isCash ? '1' : Number(item.quantity).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/60">₩${Number(item.eval_amount).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/30">${item.weight}%</td>
                      <td class="py-2 px-3 text-right font-mono font-semibold ${profitColor}">${item.isCash ? '₩0' : `${sign}₩${Number(item.profit_amount).toLocaleString()}`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${profitColor}">${item.isCash ? '0.00%' : `${sign}${item.profit_rate}%`}</td>
                    </tr>
                `;
            }).join('');

            mobileList.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
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
                            <span class="font-bold ${profitColor}">${sign}${item.profit_rate}%</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

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
                <tr class="transition border-b border-slate-100 text-[11px] leading-tight ${cursorClass} ${isEditable ? 'tx-editable-row' : ''}" data-tx="${isEditable ? itemJson : ''}">
                  <td class="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">${item.trade_date}</td>
                  <td class="py-2 px-2.5 font-medium text-slate-800 whitespace-nowrap">${item.account_name || item.account_id}</td>
                  <td class="py-2 px-2 text-center whitespace-nowrap">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap inline-block ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-2 px-3">
                    <div class="font-bold text-slate-900 whitespace-nowrap">${itemDisplayName}</div>
                  </td>
                  <td class="py-2 px-2.5 text-right font-mono whitespace-nowrap">${item.quantity ? Number(item.quantity).toLocaleString() : '-'}</td>
                  <td class="py-2 px-2.5 text-right font-mono whitespace-nowrap">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-2 px-2.5 text-right font-mono text-slate-500 whitespace-nowrap">${taxText}</td>
                  <td class="py-2 px-3 text-slate-400 truncate max-w-[140px] whitespace-nowrap">${item.memo || ''}</td>
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

function updatePaginationControls() {
    const totalPages = Math.ceil(currentDataList.length / pageSize) || 1;
    const select = document.getElementById('selectPage');
    const totalText = document.getElementById('totalPageText');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    const paginationBar = document.getElementById('paginationBar');

    if (!select || !totalText || !btnPrev || !btnNext) return;

    // 💡 [요청사항 반영] 하단 '전체 N개 종목 한눈에 보기' 문구 제거 및 빈칸 처리
    if (paginationBar) {
        const pageInfoContainer = paginationBar.querySelector('.flex.items-center.gap-1\\.5');
        if (pageInfoContainer) {
            pageInfoContainer.innerHTML = ''; // 빈칸으로 깔끔하게 비움
        }
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