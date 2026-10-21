// port/js/components/assetListTable.js
// 스프레드시트형 밴드리밸런싱 고밀도 뷰어 (목표비중 헤더 원클릭 토글 + 밴드 배율 공식: 하한 x0.8, 상한 x1.2)

const BASE_FIXED_TRADE_ID = 0; // 신규 거래내역 전면 수정/삭제 허용

let currentPage = 1;
let pageSize = 10;
let currentViewType = 'HOLDINGS';
let currentDataList = [];

// 💡 1단계: 미래-연금 밴드리밸런싱 확장 토글 상태 플래그 (기본값: false = 축소된 일반 9열 뷰)
let isRebalanceExpanded = false;
// 💡 2단계: 목표비중 편집 모드 상태 플래그
let isTargetWeightEditMode = false;

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
        isRebalanceExpanded = false;
        isTargetWeightEditMode = false;
    }
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
    // 1. 보유 종목 (HOLDINGS) 헤더 세팅
    // ==========================================
    if (viewType === 'HOLDINGS') {
        const selectedAcc = (typeof currentAccount !== 'undefined') ? currentAccount : 'ALL';
        const isPensionAccount = (selectedAcc === 'MIRAE_PENSION') || 
                                 (selectedAcc.includes('연금') && selectedAcc !== 'ALL');

        // 미래-연금 계좌이고, 사용자가 비중 토글을 눌렀을 때만 14열 와이드 리밸런싱 모드로 전환!
        const showWideRebalance = isPensionAccount && isRebalanceExpanded;

        if (title) {
            title.textContent = showWideRebalance ? '자산배분 밴드리밸런싱 포트폴리오' : '보유 종목 상세';
        }
        if (badge) badge.textContent = `${currentDataList.length}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

        if (showWideRebalance) {
            // [1단계 확장 상태]: 14개 열 와이드 헤더 & 💡 별도 [수정] 버튼 박스를 완전히 없앤 헤더 자체 토글
            const targetWeightBtnTitle = isTargetWeightEditMode ? '클릭 시 비중 저장 및 적용' : '클릭 시 목표비중 수정';
            const targetHeaderBg = isTargetWeightEditMode 
                ? 'bg-emerald-200 text-emerald-950 font-black ring-1 ring-inset ring-emerald-500' 
                : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900';
            const targetHeaderIcon = isTargetWeightEditMode 
                ? '<i class="fa-solid fa-check text-[10px] ml-1 text-emerald-700"></i>' 
                : '<i class="fa-solid fa-pen text-[9px] ml-1 opacity-60"></i>';
            const targetHeaderText = isTargetWeightEditMode ? '목표비중(저장)' : '목표비중';

            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2 text-right">수량</th>
                  <th class="py-2 px-2.5 text-right">매수평균가</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  <th class="py-2 px-2.5 text-right">손익률</th>
                  <!-- 현재비중 클릭 시 축소 토글 -->
                  <th id="thToggleRebalance" title="클릭 시 기본 테이블로 축소" class="py-2 px-2.5 text-right bg-blue-100 hover:bg-blue-200 text-blue-900 border-l border-blue-200 cursor-pointer transition select-none">
                    현재비중 <i class="fa-solid fa-compress text-[10px] ml-0.5 opacity-70"></i>
                  </th>
                  <!-- 💡 별도 수정버튼 없이 헤더 자체가 클릭형 토글로 동작하여 열 폭 최소화 -->
                  <th id="btnToggleTargetEdit" title="${targetWeightBtnTitle}" class="py-2 px-2 text-right cursor-pointer transition select-none ${targetHeaderBg}">
                    ${targetHeaderText} ${targetHeaderIcon}
                  </th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드하한</th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드상한</th>
                  <th class="py-2 px-2.5 text-center bg-slate-200/60">상태 확인</th>
                  <th class="py-2 px-3 text-right bg-slate-50 text-slate-700 border-l border-slate-200">매수/매도액</th>
                  <th class="py-2 px-2.5 text-right bg-slate-50 text-slate-700">조정 주식 수</th>
                </tr>
            `;

            // 💡 2단계: 목표비중 헤더 자체 클릭 이벤트 바인딩
            const btnToggleTargetEdit = thead.querySelector('#btnToggleTargetEdit');
            if (btnToggleTargetEdit) {
                btnToggleTargetEdit.addEventListener('click', async (e) => {
                    e.stopPropagation();

                    if (!isTargetWeightEditMode) {
                        // 수정 모드 시작 (인풋 박스 활성화)
                        isTargetWeightEditMode = true;
                        renderDataTable('HOLDINGS', currentDataList);
                    } else {
                        // 수정 모드 종료 및 저장 (D1 DB 반영 및 실시간 재계산)
                        await saveTargetWeightsAndRecalculate();
                    }
                });
            }

        } else {
            // [기본 상태]: 모든 계좌 공통 9개 열 콤팩트 헤더 (목표비중 열 없음)
            const weightHeaderHtml = isPensionAccount 
                ? `<th id="thToggleRebalance" title="클릭 시 자산배분 밴드리밸런싱 분석 확장" class="py-2 px-2.5 text-right bg-blue-50/80 hover:bg-blue-100 text-blue-800 cursor-pointer transition select-none">
                    비중 <i class="fa-solid fa-expand text-[10px] ml-0.5 opacity-70"></i>
                   </th>`
                : `<th class="py-2 px-2.5 text-right bg-blue-50/60 text-blue-800">비중</th>`;

            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2.5 text-right">매수평균가</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-2.5 text-right">수량</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  ${weightHeaderHtml}
                  <th class="py-2 px-3 text-right">평가손익</th>
                  <th class="py-2 px-2.5 text-right">수익률</th>
                </tr>
            `;
        }

        // 💡 1단계: 비중 헤더 클릭 시 리밸런싱 와이드 테이블 확장/축소 토글
        const toggleBtn = thead.querySelector('#thToggleRebalance');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isRebalanceExpanded = !isRebalanceExpanded;
                // 축소될 때는 편집 모드도 함께 안전하게 해제
                if (!isRebalanceExpanded) isTargetWeightEditMode = false;
                renderDataTable('HOLDINGS', currentDataList);
            });
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
            btnOpenModal.classList.remove('hidden');
            btnOpenModal.classList.add('inline-flex');
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

// 💡 목표비중 저장 및 D1 DB 반영 & 실시간 밴드(하한 x0.8, 상한 x1.2)/매수매도액 재연산 함수
async function saveTargetWeightsAndRecalculate() {
    const inputs = document.querySelectorAll('.target-weight-input');
    const updates = [];
    const updatedMap = new Map();

    inputs.forEach(input => {
        const ticker = input.dataset.ticker;
        const val = parseFloat(input.value);
        if (ticker && !isNaN(val) && val >= 0) {
            updates.push({ ticker, target_weight: val });
            updatedMap.set(ticker, val);
        }
    });

    const activeAccount = (typeof currentAccount !== 'undefined') ? currentAccount : 'MIRAE_PENSION';

    try {
        // 백엔드 /api/rebalance 호출하여 DB 일괄 업데이트
        const res = await fetch('/api/rebalance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_id: activeAccount,
                updates: updates
            })
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.error || '목표비중 저장 실패');
        }

        // 전체 순자산(Net Worth) 산출
        let totalNetWorth = 0;
        if (typeof cachedSummary !== 'undefined' && cachedSummary && cachedSummary.netWorth) {
            totalNetWorth = Number(cachedSummary.netWorth);
        } else {
            totalNetWorth = currentDataList.reduce((sum, item) => sum + (Number(item.eval_amount) || 0), 0);
        }

        // 메모리에 로드된 종목 리스트 재계산 (💡 밴드 공식: 하한 x0.8, 상한 x1.2)
        currentDataList.forEach(item => {
            if (updatedMap.has(item.ticker)) {
                const newTarget = updatedMap.get(item.ticker);
                const newBandMin = Number((newTarget * 0.8).toFixed(2));
                const newBandMax = Number((newTarget * 1.2).toFixed(2));
                const currentWeight = Number(item.weight) || 0;
                const currentEval = Number(item.eval_amount) || 0;

                let newStatus = '유지';
                if (currentWeight < newBandMin) newStatus = '매수';
                else if (currentWeight > newBandMax) newStatus = '매도';

                const targetEval = totalNetWorth * (newTarget / 100);
                const diffAmount = Math.round(targetEval - currentEval);
                let adjustShares = 0;
                if (!item.isCash && item.current_price > 0) {
                    adjustShares = Math.round(diffAmount / item.current_price);
                }

                item.target_weight = newTarget;
                item.band_min = newBandMin;
                item.band_max = newBandMax;
                item.rebalance_status = newStatus;
                item.diff_amount = diffAmount;
                item.adjust_shares = adjustShares;
            }
        });

        isTargetWeightEditMode = false;
        renderDataTable('HOLDINGS', currentDataList);

    } catch (err) {
        alert('목표비중 수정 중 오류가 발생했습니다: ' + err.message);
    }
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

    const totalPages = Math.ceil(currentDataList.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = currentDataList.slice(startIndex, startIndex + pageSize);

    if (currentViewType === 'HOLDINGS') {
        const selectedAcc = (typeof currentAccount !== 'undefined') ? currentAccount : 'ALL';
        const isPensionAccount = (selectedAcc === 'MIRAE_PENSION') || 
                                 (selectedAcc.includes('연금') && selectedAcc !== 'ALL');

        // 미래-연금이고 확장 토글이 켜진 경우에만 14개 열 와이드 본문 렌더링
        if (isPensionAccount && isRebalanceExpanded) {
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                let statusBadge = '<span class="text-slate-400">-</span>';
                if (item.rebalance_status === '유지') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 유지</span>';
                } else if (item.rebalance_status === '매수') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">🔵 매수</span>';
                } else if (item.rebalance_status === '매도') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">🔴 매도</span>';
                }

                const diffAmt = Number(item.diff_amount || 0);
                let diffText = '₩0';
                if (diffAmt > 0) diffText = `+₩${diffAmt.toLocaleString()}`;
                else if (diffAmt < 0) diffText = `-₩${Math.abs(diffAmt).toLocaleString()}`;

                const adjShares = Number(item.adjust_shares || 0);
                let adjText = '-';
                if (!item.isCash && item.current_price > 0) {
                    if (adjShares > 0) adjText = `+${adjShares.toLocaleString()}주`;
                    else if (adjShares < 0) adjText = `-${Math.abs(adjShares).toLocaleString()}주`;
                    else adjText = '0주';
                }

                // 💡 편집 모드일 때는 슬림한 인풋 박스(w-11)로 전환
                let targetWeightDisplay = '';
                if (isTargetWeightEditMode) {
                    const currentTargetVal = (item.target_weight !== null && item.target_weight !== undefined) ? item.target_weight : '';
                    targetWeightDisplay = `
                        <div class="inline-flex items-center justify-end">
                          <input type="number" step="0.1" min="0" max="100" 
                                 data-ticker="${item.ticker}" 
                                 value="${currentTargetVal}" 
                                 class="target-weight-input w-11 border border-emerald-400 rounded px-1 py-0.5 text-right font-mono font-bold text-emerald-900 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-[11px]" />
                          <span class="text-emerald-700 font-bold ml-0.5">%</span>
                        </div>
                    `;
                } else {
                    targetWeightDisplay = item.target_weight !== null ? `${item.target_weight}%` : '-';
                }

                // 💡 밴드 표시: DB 또는 목표비중 x0.8, x1.2 기준 보정 출력
                const calcBandMin = item.target_weight !== null ? (item.target_weight * 0.8).toFixed(2) + '%' : '-';
                const calcBandMax = item.target_weight !== null ? (item.target_weight * 1.2).toFixed(2) + '%' : '-';

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-700">${item.isCash ? '1' : Number(item.quantity).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Math.round(Number(item.avg_buy_price || 0)).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-800">₩${Number(item.current_price).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/70">₩${Number(item.eval_amount).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${profitColor}">${item.isCash ? '0.00%' : `${sign}${item.profit_rate}%`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold text-blue-700 bg-blue-50/40 border-l border-blue-50">${item.weight}%</td>
                      <td class="py-2 px-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">${targetWeightDisplay}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-500">${calcBandMin}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-500">${calcBandMax}</td>
                      <td class="py-2 px-2.5 text-center bg-slate-50/60">${statusBadge}</td>
                      <td class="py-2 px-3 text-right font-mono font-medium text-slate-500 border-l border-slate-100">${diffText}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-500">${adjText}</td>
                    </tr>
                `;
            }).join('');

            mobileList.innerHTML = pageItems.map(item => {
                let statusBadge = '<span class="text-slate-400 text-[10px]">-</span>';
                if (item.rebalance_status === '유지') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">✅ 유지</span>';
                } else if (item.rebalance_status === '매수') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">🔵 매수 권장</span>';
                } else if (item.rebalance_status === '매도') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">🔴 매도 권장</span>';
                }

                const diffAmt = Number(item.diff_amount || 0);
                let diffText = '₩0';
                if (diffAmt > 0) diffText = `+₩${diffAmt.toLocaleString()}`;
                else if (diffAmt < 0) diffText = `-₩${Math.abs(diffAmt).toLocaleString()}`;

                const adjShares = Number(item.adjust_shares || 0);
                let adjText = '';
                if (!item.isCash && item.current_price > 0) {
                    if (adjShares > 0) adjText = `(+${adjShares.toLocaleString()}주)`;
                    else if (adjShares < 0) adjText = `(-${Math.abs(adjShares).toLocaleString()}주)`;
                }

                const mobileBandMin = item.target_weight !== null ? (item.target_weight * 0.8).toFixed(1) : 0;
                const mobileBandMax = item.target_weight !== null ? (item.target_weight * 1.2).toFixed(1) : 0;

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
                            <span class="text-slate-400">밴드 ${mobileBandMin}% ~ ${mobileBandMax}%</span>
                            <span class="font-medium text-slate-500">조정 ${diffText} ${adjText}</span>
                        </div>
                    </div>
                `;
            }).join('');

        } else {
            // [기본 상태]: 9개 열 콤팩트 본문 렌더링
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Math.round(Number(item.avg_buy_price || 0)).toLocaleString()}</td>
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

    // ==========================================
    // 2. 거래원장 본문 세팅
    // ==========================================
    } else {
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
            const taxVal = (item.fee !== undefined && item.fee !== null) ? item.fee : (item.tax || 0);
            const taxText = isTransfer ? '₩0' : (taxVal ? '₩' + Number(taxVal).toLocaleString() : '₩0');

            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <tr class="transition border-b border-slate-100 text-[11px] leading-tight cursor-pointer hover:bg-blue-50/40 tx-editable-row" data-tx="${itemJson}">
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
            const taxVal = (item.fee !== undefined && item.fee !== null) ? item.fee : (item.tax || 0);
            const mobileTaxText = (!isTransfer && taxVal) ? '세금 ₩' + Number(taxVal).toLocaleString() : '';
            const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
                <div class="py-2 px-2.5 bg-white border-b border-slate-100 text-xs cursor-pointer hover:bg-slate-50 tx-editable-row" data-tx="${itemJson}">
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

    if (paginationBar) {
        const pageInfoContainer = paginationBar.querySelector('.flex.items-center.gap-1\\.5');
        if (pageInfoContainer) {
            pageInfoContainer.innerHTML = '';
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