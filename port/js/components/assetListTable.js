// port/js/components/assetListTable.js
const BASE_FIXED_TRADE_ID = 0;

let currentPage = 1;
let pageSize = 10;
let currentViewType = 'HOLDINGS';
let currentDataList = [];

let isRebalanceExpanded = false;
let isTargetWeightEditMode = false;

const mobilePriceViewToggle = new Map();
const mobileProfitViewToggle = new Map();

function isRebalanceSupportedAccount(accId) {
    const acc = accId || (typeof currentAccount !== 'undefined' ? currentAccount : 'ALL');
    return acc === 'MIRAE_PENSION' || 
           acc === 'SAMSUNG_ISA' || 
           (acc && (acc.includes('연금') || acc.includes('ISA')) && acc !== 'ALL');
}

// 💡 [중복 합산 방지 수정] PC 테이블과 모바일 카드가 동시에 인풋을 가질 때 중복으로 더해져 200%가 되던 버그 해결
function calculateTotalTargetWeight() {
    const mobileContainer = document.getElementById('mobileCardList');
    const tableContainer = document.getElementById('tableBody');
    
    // 모바일 카드가 활성화되어 표시 중인 경우 모바일 인풋 우선 탐색, 없으면 PC 테이블 인풋 탐색
    let inputs = [];
    if (mobileContainer && window.getComputedStyle(mobileContainer).display !== 'none') {
        inputs = mobileContainer.querySelectorAll('.target-weight-input');
    }
    if (!inputs || inputs.length === 0) {
        if (tableContainer) {
            inputs = tableContainer.querySelectorAll('.target-weight-input');
        }
    }
    if (!inputs || inputs.length === 0) {
        inputs = document.querySelectorAll('.target-weight-input');
    }

    let total = 0;
    if (inputs.length > 0) {
        // 동일 ticker가 중복 집계되지 않도록 Map으로 한 번 더 방어
        const tickerMap = new Map();
        inputs.forEach(inp => {
            const ticker = inp.dataset.ticker || Math.random().toString();
            const val = parseFloat(inp.value);
            if (!isNaN(val)) {
                tickerMap.set(ticker, val);
            }
        });
        tickerMap.forEach(val => {
            total += val;
        });
    } else {
        currentDataList.forEach(item => {
            const val = parseFloat(item.target_weight);
            if (!isNaN(val)) total += val;
        });
    }
    return parseFloat(total.toFixed(1));
}

function updateTargetHeaderLiveSum() {
    const total = calculateTotalTargetWeight();

    // PC 헤더 버튼 갱신
    const btn = document.getElementById('btnToggleTargetEdit');
    if (btn && isTargetWeightEditMode) {
        btn.textContent = `목표비중(${total})`;
        if (Math.abs(total - 100) < 0.05) {
            btn.className = 'py-2 px-2 text-right cursor-pointer transition select-none bg-emerald-200 text-emerald-950 font-black ring-1 ring-inset ring-emerald-500';
            btn.title = `합계: ${total}% (클릭 시 비중 저장 및 적용)`;
        } else {
            btn.className = 'py-2 px-2 text-right cursor-pointer transition select-none bg-amber-200 text-amber-950 font-black ring-1 ring-inset ring-amber-500';
            btn.title = `현재 합계: ${total}% (100%에 맞춰 조절 후 클릭하여 저장)`;
        }
    }

    // 모바일 전용 저장 바 갱신
    const mobileSaveBtn = document.getElementById('btnMobileSaveTargetWeight');
    const mobileSumSpan = document.getElementById('mobileTargetWeightSum');
    if (mobileSumSpan) mobileSumSpan.textContent = `${total}%`;
    if (mobileSaveBtn) {
        if (Math.abs(total - 100) < 0.05) {
            mobileSaveBtn.className = 'w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-between shadow-sm active:scale-95 transition';
            mobileSaveBtn.disabled = false;
        } else {
            mobileSaveBtn.className = 'w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-between shadow-sm active:scale-95 transition';
            mobileSaveBtn.disabled = false;
        }
    }
}

function calculateSmartRebalance(items) {
    let totalNetWorth = 0;
    if (typeof cachedSummary !== 'undefined' && cachedSummary && cachedSummary.netWorth) {
        totalNetWorth = Number(cachedSummary.netWorth);
    } else {
        totalNetWorth = items.reduce((sum, item) => sum + (Number(item.eval_amount) || 0), 0);
    }

    const buyCandidates = [];

    items.forEach(item => {
        const hasTarget = (item.target_weight !== null && item.target_weight !== undefined && !isNaN(item.target_weight) && Number(item.target_weight) > 0);
        const targetW = hasTarget ? Number(item.target_weight) : null;
        const dynamicBandMin = targetW !== null ? Number((targetW * 0.8).toFixed(2)) : null;
        const dynamicBandMax = targetW !== null ? Number((targetW * 1.2).toFixed(2)) : null;
        const curWeight = Number(item.weight) || 0;
        const curEval = Number(item.eval_amount) || 0;
        const profitAmt = Number(item.profit_amount || 0);

        let initialStatus = '-';

        if (targetW !== null && dynamicBandMin !== null && dynamicBandMax !== null) {
            if (curWeight < dynamicBandMin) {
                initialStatus = '매수';
            } else if (curWeight > dynamicBandMax) {
                if (item.isCash || profitAmt >= 0) {
                    initialStatus = '매도';
                } else {
                    initialStatus = '유지';
                }
            } else {
                initialStatus = '유지';
            }
        }

        item._calculatedStatus = initialStatus;
        item._buyPriority = null;
        item._rescueCost = 0;

        if (initialStatus === '매수' && dynamicBandMin !== null) {
            const minRequiredEval = totalNetWorth * (dynamicBandMin / 100.0);
            const rescueCost = Math.max(0, Math.round(minRequiredEval - curEval));
            item._rescueCost = rescueCost;
            buyCandidates.push(item);
        }
    });

    buyCandidates.sort((a, b) => a._rescueCost - b._rescueCost);

    buyCandidates.forEach((item, idx) => {
        item._buyPriority = idx + 1;
    });
}

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

    if (viewType === 'HOLDINGS') {
        const selectedAcc = (typeof currentAccount !== 'undefined') ? currentAccount : 'ALL';
        const isSupported = isRebalanceSupportedAccount(selectedAcc);
        const showWideRebalance = isSupported && isRebalanceExpanded;

        if (title) title.textContent = showWideRebalance ? '자산배분 밴드리밸런싱 포트폴리오' : '보유 종목 상세';
        if (badge) badge.textContent = `${currentDataList.length}종목`;

        if (btnOpenModal) {
            btnOpenModal.classList.add('hidden');
            btnOpenModal.classList.remove('inline-flex');
        }

        if (showWideRebalance) {
            const initialTotal = calculateTotalTargetWeight();
            const targetWeightBtnTitle = isTargetWeightEditMode ? `합계: ${initialTotal}% (클릭 시 비중 저장 및 적용)` : '클릭 시 목표비중 설정/수정';
            
            let targetHeaderBg = 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900';
            let targetHeaderText = '목표비중';

            if (isTargetWeightEditMode) {
                targetHeaderText = `목표비중(${initialTotal})`;
                if (Math.abs(initialTotal - 100) < 0.05) {
                    targetHeaderBg = 'bg-emerald-200 text-emerald-950 font-black ring-1 ring-inset ring-emerald-500';
                } else {
                    targetHeaderBg = 'bg-amber-200 text-amber-950 font-black ring-1 ring-inset ring-amber-500';
                }
            }

            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2.5 text-right bg-slate-200/40">매입금액</th>
                  <th class="py-2 px-2.5 text-right">평균단가</th>
                  <th class="py-2 px-2.5 text-right">수량</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  <th class="py-2 px-3 text-right">평가손익</th>
                  <th class="py-2 px-2.5 text-right">수익률</th>
                  <th id="thToggleRebalance" title="클릭 시 기본 테이블로 축소" class="py-2 px-2.5 text-right bg-blue-100 hover:bg-blue-200 text-blue-900 border-l border-blue-200 cursor-pointer transition select-none">
                    현재비중 <i class="fa-solid fa-compress text-[10px] ml-0.5 opacity-70"></i>
                  </th>
                  <th id="btnToggleTargetEdit" title="${targetWeightBtnTitle}" class="py-2 px-2 text-right cursor-pointer transition select-none ${targetHeaderBg}">
                    ${targetHeaderText}
                  </th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드하한</th>
                  <th class="py-2 px-2 text-right text-slate-500">밴드상한</th>
                  <th class="py-2 px-2.5 text-center bg-slate-200/60">상태 확인</th>
                  <th class="py-2 px-3 text-right bg-slate-50 text-slate-700 border-l border-slate-200">매수/매도액</th>
                  <th class="py-2 px-2.5 text-right bg-slate-50 text-slate-700">조정 주식 수</th>
                </tr>
            `;

            const btnToggleTargetEdit = thead.querySelector('#btnToggleTargetEdit');
            if (btnToggleTargetEdit) {
                btnToggleTargetEdit.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!isTargetWeightEditMode) {
                        isTargetWeightEditMode = true;
                        renderDataTable('HOLDINGS', currentDataList);
                    } else {
                        await saveTargetWeightsAndRecalculate();
                    }
                });
            }

        } else {
            const weightHeaderHtml = isSupported 
                ? `<th id="thToggleRebalance" title="클릭 시 자산배분 밴드리밸런싱 분석 확장" class="py-2 px-2.5 text-right bg-blue-50/80 hover:bg-blue-100 text-blue-800 cursor-pointer transition select-none">
                    비중 <i class="fa-solid fa-expand text-[10px] ml-0.5 opacity-70"></i>
                   </th>`
                : `<th class="py-2 px-2.5 text-right bg-blue-50/60 text-blue-800">비중</th>`;

            thead.innerHTML = `
                <tr class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 select-none whitespace-nowrap">
                  <th class="py-2 px-3 text-left">종목명</th>
                  <th class="py-2 px-2 text-center">코드</th>
                  <th class="py-2 px-2.5 text-right bg-slate-200/40">매입금액</th>
                  <th class="py-2 px-2.5 text-right">평균단가</th>
                  <th class="py-2 px-2.5 text-right">수량</th>
                  <th class="py-2 px-2.5 text-right">현재가</th>
                  <th class="py-2 px-3 text-right bg-slate-200/50">평가금액</th>
                  <th class="py-2 px-3 text-right">평가손익</th>
                  <th class="py-2 px-2.5 text-right">수익률</th>
                  ${weightHeaderHtml}
                </tr>
            `;
        }

        const toggleBtn = thead.querySelector('#thToggleRebalance');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isRebalanceExpanded = !isRebalanceExpanded;
                if (!isRebalanceExpanded) isTargetWeightEditMode = false;
                renderDataTable('HOLDINGS', currentDataList);
            });
        }

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

    if (isTargetWeightEditMode) {
        const inputs = document.querySelectorAll('.target-weight-input');
        inputs.forEach(inp => {
            inp.addEventListener('input', () => {
                updateTargetHeaderLiveSum();
            });
        });
        updateTargetHeaderLiveSum();
    }
}

async function saveTargetWeightsAndRecalculate() {
    const mobileContainer = document.getElementById('mobileCardList');
    const tableContainer = document.getElementById('tableBody');
    
    let inputs = [];
    if (mobileContainer && window.getComputedStyle(mobileContainer).display !== 'none') {
        inputs = mobileContainer.querySelectorAll('.target-weight-input');
    }
    if (!inputs || inputs.length === 0) {
        if (tableContainer) {
            inputs = tableContainer.querySelectorAll('.target-weight-input');
        }
    }
    if (!inputs || inputs.length === 0) {
        inputs = document.querySelectorAll('.target-weight-input');
    }

    const updates = [];
    const updatedMap = new Map();

    inputs.forEach(input => {
        const ticker = input.dataset.ticker;
        const val = parseFloat(input.value);
        if (ticker && !isNaN(val) && val >= 0) {
            if (!updatedMap.has(ticker)) {
                updates.push({ ticker, target_weight: val });
                updatedMap.set(ticker, val);
            }
        }
    });

    const activeAccount = (typeof currentAccount !== 'undefined') ? currentAccount : 'SAMSUNG_ISA';

    try {
        const res = await fetch('/api/rebalance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_id: activeAccount,
                updates: updates
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || '목표비중 저장 실패');

        let totalNetWorth = 0;
        if (typeof cachedSummary !== 'undefined' && cachedSummary && cachedSummary.netWorth) {
            totalNetWorth = Number(cachedSummary.netWorth);
        } else {
            totalNetWorth = currentDataList.reduce((sum, item) => sum + (Number(item.eval_amount) || 0), 0);
        }

        currentDataList.forEach(item => {
            if (updatedMap.has(item.ticker)) {
                const newTarget = updatedMap.get(item.ticker);
                const newBandMin = Number((newTarget * 0.8).toFixed(2));
                const newBandMax = Number((newTarget * 1.2).toFixed(2));
                const currentEval = Number(item.eval_amount) || 0;

                const targetEval = totalNetWorth * (newTarget / 100);
                const diffAmount = Math.round(targetEval - currentEval);
                let adjustShares = 0;
                if (!item.isCash && item.current_price > 0) {
                    adjustShares = Math.round(diffAmount / item.current_price);
                }

                item.target_weight = newTarget;
                item.band_min = newBandMin;
                item.band_max = newBandMax;
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
        tbody.innerHTML = `<tr><td colspan="16" class="py-8 text-center text-slate-400 text-xs">데이터가 없습니다.</td></tr>`;
        mobileList.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">데이터가 없습니다.</div>`;
        return;
    }

    const totalPages = Math.ceil(currentDataList.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = currentDataList.slice(startIndex, startIndex + pageSize);

    if (currentViewType === 'HOLDINGS') {
        const selectedAcc = (typeof currentAccount !== 'undefined') ? currentAccount : 'ALL';
        const isSupported = isRebalanceSupportedAccount(selectedAcc);

        if (isSupported && isRebalanceExpanded) {
            calculateSmartRebalance(currentDataList);

            // PC 테이블 행 렌더링
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                const hasTarget = (item.target_weight !== null && item.target_weight !== undefined && !isNaN(item.target_weight) && Number(item.target_weight) > 0);
                const targetW = hasTarget ? Number(item.target_weight) : null;
                const dynamicBandMin = targetW !== null ? Number((targetW * 0.8).toFixed(2)) : null;
                const dynamicBandMax = targetW !== null ? Number((targetW * 1.2).toFixed(2)) : null;

                const calculatedStatus = item._calculatedStatus || '-';
                const buyPriority = item._buyPriority;

                let statusBadge = '<span class="text-slate-400 font-bold">-</span>';
                if (calculatedStatus === '유지') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 유지</span>';
                } else if (calculatedStatus === '매수') {
                    const priorityText = buyPriority ? `🔵 매수 ${buyPriority}` : '🔵 매수';
                    const rescueTip = item._rescueCost ? ` title="밴드하한 복귀 최소필요액: ₩${item._rescueCost.toLocaleString()}"` : '';
                    statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse cursor-help"${rescueTip}>${priorityText}</span>`;
                } else if (calculatedStatus === '매도') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">🔴 매도</span>';
                }

                let diffText = '₩0';
                let adjText = '-';

                if (hasTarget) {
                    const diffAmt = Number(item.diff_amount || 0);
                    if (diffAmt > 0) diffText = `+₩${diffAmt.toLocaleString()}`;
                    else if (diffAmt < 0) diffText = `-₩${Math.abs(diffAmt).toLocaleString()}`;

                    const adjShares = Number(item.adjust_shares || 0);
                    if (!item.isCash && item.current_price > 0) {
                        if (adjShares > 0) adjText = `+${adjShares.toLocaleString()}주`;
                        else if (adjShares < 0) adjText = `-${Math.abs(adjShares).toLocaleString()}주`;
                        else adjText = '0주';
                    }
                }

                let targetWeightDisplay = '';
                if (isTargetWeightEditMode) {
                    const currentTargetVal = targetW !== null ? targetW : '';
                    targetWeightDisplay = `
                        <div class="inline-flex items-center justify-end">
                          <input type="number" step="0.1" min="0" max="100" 
                                 data-ticker="${item.ticker}" 
                                 value="${currentTargetVal}" 
                                 placeholder="0"
                                 class="target-weight-input w-11 border border-emerald-400 rounded px-1 py-0.5 text-right font-mono font-bold text-emerald-900 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-[11px]" />
                          <span class="text-emerald-700 font-bold ml-0.5">%</span>
                        </div>
                    `;
                } else {
                    targetWeightDisplay = targetW !== null ? `${targetW}%` : '-';
                }

                const displayBandMinText = dynamicBandMin !== null ? dynamicBandMin.toFixed(2) + '%' : '-';
                const displayBandMaxText = dynamicBandMax !== null ? dynamicBandMax.toFixed(2) + '%' : '-';

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600 bg-slate-50/50">₩${Number(item.buy_amount || 0).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Math.round(Number(item.avg_buy_price || 0)).toLocaleString()}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-700">${item.isCash ? '1' : Number(item.quantity).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-800">₩${Number(item.current_price).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/70">₩${Number(item.eval_amount).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-semibold ${profitColor}">${item.isCash ? '₩0' : `${sign}₩${Number(item.profit_amount).toLocaleString()}`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${profitColor}">${item.isCash ? '0.00%' : `${sign}${item.profit_rate}%`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold text-slate-800 bg-slate-50/40 border-l border-slate-200/60">${item.weight}%</td>
                      <td class="py-2 px-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">${targetWeightDisplay}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-500">${displayBandMinText}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-500">${displayBandMaxText}</td>
                      <td class="py-2 px-2.5 text-center bg-slate-50/60">${statusBadge}</td>
                      <td class="py-2 px-3 text-right font-mono font-medium text-slate-500 border-l border-slate-100">${diffText}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-500">${adjText}</td>
                    </tr>
                `;
            }).join('');

            // 모바일 밴드리밸런싱 카드 뷰
            const initialTotal = calculateTotalTargetWeight();
            let mobileHeaderHtml = '';
            
            if (isTargetWeightEditMode) {
                const isTargetComplete = Math.abs(initialTotal - 100) < 0.05;
                const btnBg = isTargetComplete ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600';
                
                mobileHeaderHtml = `
                    <div class="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl mb-2 flex flex-col gap-2">
                        <button type="button" id="btnMobileSaveTargetWeight" class="w-full py-2 px-3 rounded-lg ${btnBg} text-white font-bold text-xs flex items-center justify-between shadow-sm active:scale-95 transition">
                            <span class="flex items-center gap-1.5"><i class="fa-solid fa-floppy-disk"></i> 목표비중 저장 및 적용</span>
                            <span id="mobileTargetWeightSum" class="font-mono bg-black/20 px-2 py-0.5 rounded text-[11px]">${initialTotal}%</span>
                        </button>
                    </div>
                `;
            }

            const mobileCardsHtml = pageItems.map(item => {
                const hasTarget = (item.target_weight !== null && item.target_weight !== undefined && !isNaN(item.target_weight) && Number(item.target_weight) > 0);
                const targetW = hasTarget ? Number(item.target_weight) : null;
                const dynamicBandMin = targetW !== null ? Number((targetW * 0.8).toFixed(1)) : 0;
                const dynamicBandMax = targetW !== null ? Number((targetW * 1.2).toFixed(1)) : 0;

                const calculatedStatus = item._calculatedStatus || '-';
                const buyPriority = item._buyPriority;

                let statusBadge = '<span class="text-slate-400 text-[10px] font-bold">-</span>';
                if (calculatedStatus === '유지') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">✅ 유지</span>';
                } else if (calculatedStatus === '매수') {
                    const priorityText = buyPriority ? `🔵 매수 ${buyPriority}` : '🔵 매수';
                    statusBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">${priorityText}</span>`;
                } else if (calculatedStatus === '매도') {
                    statusBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">🔴 매도</span>';
                }

                let diffText = '₩0';
                let adjText = '';
                if (hasTarget) {
                    const diffAmt = Number(item.diff_amount || 0);
                    if (diffAmt > 0) diffText = `+₩${diffAmt.toLocaleString()}`;
                    else if (diffAmt < 0) diffText = `-₩${Math.abs(diffAmt).toLocaleString()}`;

                    const adjShares = Number(item.adjust_shares || 0);
                    if (!item.isCash && item.current_price > 0) {
                        if (adjShares > 0) adjText = `(+${adjShares.toLocaleString()}주)`;
                        else if (adjShares < 0) adjText = `(-${Math.abs(adjShares).toLocaleString()}주)`;
                    }
                }

                const bandText = hasTarget ? `밴드 ${dynamicBandMin}% ~ ${dynamicBandMax}%` : '밴드 미설정';

                let mobileTargetArea = '';
                if (isTargetWeightEditMode) {
                    const currentTargetVal = targetW !== null ? targetW : '';
                    mobileTargetArea = `
                        <div class="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-300">
                            <span class="text-[10px] text-emerald-800 font-bold">목표:</span>
                            <input type="number" step="0.1" min="0" max="100" 
                                   data-ticker="${item.ticker}" 
                                   value="${currentTargetVal}" 
                                   placeholder="0"
                                   class="target-weight-input w-12 border border-emerald-400 rounded px-1 py-0.5 text-right font-mono font-bold text-emerald-950 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs" />
                            <span class="text-[10px] text-emerald-700 font-bold">%</span>
                        </div>
                    `;
                } else {
                    mobileTargetArea = `
                        <button type="button" class="mobile-target-edit-trigger font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition active:scale-95" title="터치 시 목표비중 편집">
                            <span>목표 ${hasTarget ? item.target_weight + '%' : '-'}</span>
                            <i class="fa-solid fa-pen text-[9px] opacity-60"></i>
                        </button>
                    `;
                }

                return `
                    <div class="py-2.5 px-3 bg-white border-b border-slate-100 text-xs">
                        <div class="flex justify-between items-center mb-1.5">
                            <div class="font-bold text-slate-900 truncate max-w-[170px]">${item.asset_name}</div>
                            <div class="flex items-center gap-1.5">
                                <span class="mobile-rebalance-toggle-btn cursor-pointer font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-[11px] active:scale-95 transition" title="터치 시 기본 화면으로 축소">
                                    ${item.weight}% <i class="fa-solid fa-compress text-[9px]"></i>
                                </span>
                                <div>${statusBadge}</div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center text-[11px] mb-1">
                            <span class="text-slate-500">평가 ₩${Number(item.eval_amount).toLocaleString()}</span>
                            ${mobileTargetArea}
                        </div>
                        <div class="flex justify-between items-center text-[11px] pt-1 border-t border-slate-50">
                            <span class="text-slate-400">${bandText}</span>
                            <span class="font-medium text-slate-500">조정 ${diffText} ${adjText}</span>
                        </div>
                    </div>
                `;
            }).join('');

            mobileList.innerHTML = mobileHeaderHtml + mobileCardsHtml;

            const rebCloseBtns = mobileList.querySelectorAll('.mobile-rebalance-toggle-btn');
            rebCloseBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isRebalanceExpanded = false;
                    isTargetWeightEditMode = false;
                    renderDataTable('HOLDINGS', currentDataList);
                });
            });

            const editTriggers = mobileList.querySelectorAll('.mobile-target-edit-trigger');
            editTriggers.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isTargetWeightEditMode = true;
                    renderDataTable('HOLDINGS', currentDataList);
                });
            });

            const mobileSaveBtn = document.getElementById('btnMobileSaveTargetWeight');
            if (mobileSaveBtn) {
                mobileSaveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await saveTargetWeightsAndRecalculate();
                });
            }

        } else {
            tbody.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-600' : 'text-blue-600';
                const sign = isPositive ? '+' : '';

                return `
                    <tr class="hover:bg-blue-50/40 transition-colors border-b border-slate-100 text-[11px] leading-tight whitespace-nowrap">
                      <td class="py-2 px-3 font-semibold text-slate-900">${item.asset_name}</td>
                      <td class="py-2 px-2 text-center font-mono text-[10px] text-slate-400">${item.ticker}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600 bg-slate-50/40">₩${Number(item.buy_amount || 0).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono text-slate-600">₩${Math.round(Number(item.avg_buy_price || 0)).toLocaleString()}</td>
                      <td class="py-2 px-2 text-right font-mono text-slate-700">${item.isCash ? '1' : Number(item.quantity).toLocaleString()}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-medium text-slate-800">₩${Number(item.current_price).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/60">₩${Number(item.eval_amount).toLocaleString()}</td>
                      <td class="py-2 px-3 text-right font-mono font-semibold ${profitColor}">${item.isCash ? '₩0' : `${sign}₩${Number(item.profit_amount).toLocaleString()}`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold ${profitColor}">${item.isCash ? '0.00%' : `${sign}${item.profit_rate}%`}</td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold text-slate-800">${item.weight}%</td>
                    </tr>
                `;
            }).join('');

            mobileList.innerHTML = pageItems.map(item => {
                const isPositive = Number(item.profit_amount || 0) >= 0;
                const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
                const sign = isPositive ? '+' : '';

                const isPriceToggled = mobilePriceViewToggle.get(item.ticker) === true;
                let priceHtml = '';
                if (!isPriceToggled) {
                    priceHtml = `<span>매입 ₩${Number(item.buy_amount || 0).toLocaleString()} · 평가 ₩${Number(item.eval_amount).toLocaleString()}</span>`;
                } else {
                    const avgPriceStr = Math.round(Number(item.avg_buy_price || 0)).toLocaleString();
                    const curPriceStr = Number(item.current_price).toLocaleString();
                    const qtyStr = item.isCash ? '1주' : `${Number(item.quantity).toLocaleString()}주`;
                    priceHtml = `<span>평균단가: ₩${avgPriceStr} · 현재가: ₩${curPriceStr} (${qtyStr})</span>`;
                }

                const isProfitToggled = mobileProfitViewToggle.get(item.ticker) === true;
                let profitHtml = '';
                if (item.isCash) {
                    profitHtml = `<span class="font-bold ${profitColor}">+0%</span>`;
                } else if (!isProfitToggled) {
                    profitHtml = `<span class="font-bold ${profitColor}">${sign}${item.profit_rate}%</span>`;
                } else {
                    profitHtml = `<span class="font-bold ${profitColor}">${sign}₩${Number(item.profit_amount).toLocaleString()}</span>`;
                }

                const weightBadgeHtml = isSupported 
                    ? `<div class="mobile-rebalance-open-btn cursor-pointer font-mono font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 active:scale-95 transition" title="터치 시 자산배분 밴드리밸런싱 분석 확장">
                         <span>${item.weight}%</span>
                         <i class="fa-solid fa-expand text-[9px] text-blue-500"></i>
                       </div>`
                    : `<div class="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">${item.weight}%</div>`;

                return `
                    <div class="py-2 px-2.5 bg-white border-b border-slate-100 text-xs select-none">
                        <div class="flex justify-between items-center mb-1">
                            <div class="font-bold text-slate-900 truncate max-w-[190px]">${item.asset_name}</div>
                            ${weightBadgeHtml}
                        </div>
                        <div class="flex justify-between items-center text-[11px] text-slate-600">
                            <div class="mobile-price-toggle-btn cursor-pointer py-0.5 active:opacity-60 transition" data-ticker="${item.ticker}">
                                ${priceHtml}
                            </div>
                            <div class="mobile-profit-toggle-btn cursor-pointer py-0.5 active:opacity-60 transition" data-ticker="${item.ticker}">
                                ${profitHtml}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const rebOpenBtns = mobileList.querySelectorAll('.mobile-rebalance-open-btn');
            rebOpenBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isRebalanceExpanded = true;
                    renderDataTable('HOLDINGS', currentDataList);
                });
            });

            const priceBtns = mobileList.querySelectorAll('.mobile-price-toggle-btn');
            priceBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const ticker = btn.dataset.ticker;
                    const curState = mobilePriceViewToggle.get(ticker) || false;
                    mobilePriceViewToggle.set(ticker, !curState);
                    renderPaginatedRows();
                });
            });

            const profitBtns = mobileList.querySelectorAll('.mobile-profit-toggle-btn');
            profitBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const ticker = btn.dataset.ticker;
                    const curState = mobileProfitViewToggle.get(ticker) || false;
                    mobileProfitViewToggle.set(ticker, !curState);
                    renderPaginatedRows();
                });
            });
        }

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
        if (pageInfoContainer) pageInfoContainer.innerHTML = '';
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