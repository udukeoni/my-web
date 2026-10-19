// port/js/app.js
// 계좌 선택, 탭 스위칭, 밴드리밸런싱 데이터 보존 및 예수금(CASH) 통합 컨트롤러

let currentAccount = 'ALL';
let currentView = 'OVERVIEW'; // 기본값을 '자산 현황(OVERVIEW)'으로 설정
let cachedAccounts = [];
let cachedHoldings = [];
let cachedLogs = [];
let cachedSummary = null;

// 로컬에 캐시된 일간 등락률 가져오기
function getStoredDailyRates() {
    try {
        return JSON.parse(localStorage.getItem('DAILY_RATES_CACHE') || '{}');
    } catch (_) {
        return {};
    }
}

async function fetchD1Portfolio() {
    try {
        const apiView = currentView === 'OVERVIEW' ? 'HOLDINGS' : currentView;
        const res = await fetch(`/api/portfolio?account=${currentAccount}&view=${apiView}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // 계좌, 종목, 거래로그 캐싱
        cachedAccounts = data.accounts || [];
        cachedHoldings = data.holdings || [];
        cachedLogs = data.logs || [];
        cachedSummary = data.summary || {};

        // 1. 계좌 선택 드롭다운 채우기
        populateAccountOptions(cachedAccounts);

        // 2. 모달창 콤보박스 채우기
        populateModalOptions(cachedAccounts, cachedHoldings);

        // 3. 상단 요약 카드 및 자산추이 차트 렌더링
        if (typeof renderSummaryCard === 'function') {
            renderSummaryCard(data.summary, data.chartData);
        }

        // 4. 종목 데이터에 최신 일간 등락률 매핑
        const dailyRatesMap = getStoredDailyRates();
        const holdingsWithDaily = cachedHoldings.map(h => ({
            ...h,
            daily_change_rate: dailyRatesMap[h.ticker] !== undefined ? dailyRatesMap[h.ticker] : (h.daily_change_rate || 0)
        }));

        // 5. 자산 비중 트리맵 차트 렌더링 (순수 주식 종목 대상)
        if (typeof renderTreemapChart === 'function') {
            renderTreemapChart(holdingsWithDaily);
        }

        // 6. 💡 [핵심] 리밸런싱 속성(target_weight, band_min/max 등)을 100% 온전히 유지하며 비중 재계산
        const totalNetWorth = Number(cachedSummary.netWorth) || 0;
        const cashBalance = Number(cachedSummary.cashBalance) || 0;

        let tableDisplayHoldings = holdingsWithDaily.map(item => {
            const itemEval = Number(item.eval_amount) || 0;
            const weightAgainstNetWorth = totalNetWorth > 0 ? Number(((itemEval / totalNetWorth) * 100).toFixed(2)) : 0;
            return {
                ...item, // 백엔드에서 계산된 target_weight, band_min, band_max, rebalance_status, diff_amount, adjust_shares 온전 유지
                weight: weightAgainstNetWorth
            };
        });

        // 7. 예수금(CASH) 가상 종목 추가 시에도 리밸런싱 설정값 매핑
        if (cashBalance > 0) {
            const cashWeight = totalNetWorth > 0 ? Number(((cashBalance / totalNetWorth) * 100).toFixed(2)) : 0;
            
            let accName = '전체 계좌';
            if (currentAccount !== 'ALL') {
                const found = cachedAccounts.find(a => a.account_id === currentAccount);
                if (found) accName = found.account_name;
            }

            // 미래-연금 계좌인 경우 예수금 목표 비중 10% (8%~12%) 자동 연동
            let cashTargetWeight = null;
            let cashBandMin = null;
            let cashBandMax = null;
            let cashStatus = '유지';
            let cashDiffAmount = 0;

            if (currentAccount === '미래-연금') {
                cashTargetWeight = 10.0;
                cashBandMin = 8.0;
                cashBandMax = 12.0;

                if (cashWeight < cashBandMin) cashStatus = '매수';
                else if (cashWeight > cashBandMax) cashStatus = '매도';
                else cashStatus = '유지';

                const targetCashVal = totalNetWorth * 0.10;
                cashDiffAmount = Math.round(targetCashVal - cashBalance);
            }

            tableDisplayHoldings.push({
                holding_id: 'CASH_VIRTUAL',
                account_id: currentAccount,
                account_name: accName,
                ticker: '현금',
                asset_name: '예수금 (원화)',
                sector: '현금자산',
                quantity: 1,
                avg_buy_price: cashBalance,
                current_price: cashBalance,
                buy_amount: cashBalance,
                eval_amount: cashBalance,
                profit_amount: 0,
                profit_rate: 0.00,
                weight: cashWeight,
                target_weight: cashTargetWeight,
                band_min: cashBandMin,
                band_max: cashBandMax,
                rebalance_status: cashStatus,
                diff_amount: cashDiffAmount,
                adjust_shares: 0,
                isCash: true
            });
        }

        // 8. 화면 스위칭 및 테이블 렌더링
        applyViewSwitching(tableDisplayHoldings);

    } catch (err) {
        console.error("D1 API 호출 에러:", err);
        const tbody = document.getElementById('tableBody');
        const mobileList = document.getElementById('mobileCardList');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="14" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
        }
        if (mobileList) {
            mobileList.innerHTML = `<div class="py-8 text-center text-red-500 text-sm">DB 연동 오류: ${err.message}</div>`;
        }
    }
}

// 자산현황 ↔ 상세 테이블 동적 전환(스위칭) 함수
function applyViewSwitching(holdingsData) {
    const overviewBox = document.getElementById('overviewContainer');
    const tableBox = document.getElementById('tableContainer');

    if (currentView === 'OVERVIEW') {
        if (overviewBox) overviewBox.classList.remove('hidden');
        if (tableBox) tableBox.classList.add('hidden');
    } else {
        if (overviewBox) overviewBox.classList.add('hidden');
        if (tableBox) tableBox.classList.remove('hidden');

        if (typeof renderDataTable === 'function') {
            const listToRender = currentView === 'HOLDINGS' ? holdingsData : cachedLogs;
            renderDataTable(currentView, listToRender);
        }
    }
}

function populateAccountOptions(accounts) {
    const select = document.getElementById('selectAccount');
    if (!select || select.children.length > 1) return;

    accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.account_id;
        opt.textContent = acc.account_name;
        select.appendChild(opt);
    });
}

function populateModalOptions(accounts, holdings) {
    const accountSelect = document.getElementById('txAccount');
    const stockSelect = document.getElementById('txStock');

    if (accountSelect && accountSelect.children.length === 0) {
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.account_id;
            opt.textContent = acc.account_name;
            accountSelect.appendChild(opt);
        });
    }

    if (stockSelect && stockSelect.children.length <= 2) {
        stockSelect.innerHTML = '';

        const defaultOptions = [
            { ticker: 'CASH', name: '원화 현금' },
            { ticker: 'INTEREST', name: '이자 (예수금 이용료)' }
        ];

        defaultOptions.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.ticker;
            opt.textContent = item.name;
            stockSelect.appendChild(opt);
        });

        const uniqueStocks = new Map();
        holdings.forEach(h => {
            if (h.ticker && h.ticker !== '현금' && !uniqueStocks.has(h.ticker)) {
                uniqueStocks.set(h.ticker, h.asset_name);
            }
        });

        uniqueStocks.forEach((name, ticker) => {
            const opt = document.createElement('option');
            opt.value = ticker;
            opt.textContent = `${name} (${ticker})`;
            stockSelect.appendChild(opt);
        });
    }
}

function toggleQtyAndPriceFields() {
    const txTypeSelect = document.getElementById('txType');
    const txStockSelect = document.getElementById('txStock');
    const inputQty = document.getElementById('txQuantity');
    const inputPrice = document.getElementById('txPrice');
    if (!txTypeSelect || !inputQty || !inputPrice) return;

    const noQtyTypes = ['분배금', '배당금', '이자', '입금', '출금'];
    if (noQtyTypes.includes(txTypeSelect.value)) {
        inputQty.disabled = true;
        inputPrice.disabled = true;
        inputQty.value = '';
        inputPrice.value = '';

        if (txTypeSelect.value === '이자' && txStockSelect) {
            txStockSelect.value = 'INTEREST';
        } else if ((txTypeSelect.value === '입금' || txTypeSelect.value === '출금') && txStockSelect) {
            txStockSelect.value = 'CASH';
        }
    } else {
        inputQty.disabled = false;
        inputPrice.disabled = false;
    }
}

function setupTabButtons() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => {
                b.className = 'tab-btn w-full text-center px-1 sm:px-2.5 py-1.5 rounded-lg transition text-slate-500 hover:text-slate-800 whitespace-nowrap';
            });
            btn.className = 'tab-btn w-full text-center px-1 sm:px-2.5 py-1.5 rounded-lg transition bg-white shadow-sm text-blue-600 font-bold whitespace-nowrap';

            currentView = btn.getAttribute('data-view');
            fetchD1Portfolio();
        });
    });
}

function setupTxModal() {
    const modal = document.getElementById('txModal');
    const btnClose = document.getElementById('btnCloseTxModal');
    const btnCancel = document.getElementById('btnCancelTx');
    const btnDelete = document.getElementById('btnDeleteTx');
    const form = document.getElementById('txForm');
    const modalTitle = document.getElementById('txModalTitle');
    const submitBtn = document.getElementById('btnSubmitTx');

    const inputId = document.getElementById('txId');
    const inputDate = document.getElementById('txDate');
    const selectAcc = document.getElementById('txAccount');
    const selectType = document.getElementById('txType');
    const selectStock = document.getElementById('txStock');
    const inputQty = document.getElementById('txQuantity');
    const inputPrice = document.getElementById('txPrice');
    const inputAmount = document.getElementById('txAmount');
    const inputTax = document.getElementById('txTax');
    const inputMemo = document.getElementById('txMemo');

    const closeModal = () => {
        if (modal) modal.classList.add('hidden');
    };
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    document.addEventListener('click', (e) => {
        if (e.target.closest('#btnOpenTxModal')) {
            if (form) form.reset();
            if (inputId) inputId.value = '';
            if (inputDate) inputDate.value = new Date().toISOString().split('T')[0];
            if (inputTax) inputTax.value = '0';
            if (modalTitle) modalTitle.textContent = '거래내역 직접 입력';
            if (submitBtn) submitBtn.textContent = '내역 저장';
            if (btnDelete) btnDelete.classList.add('hidden');
            toggleQtyAndPriceFields();
            if (modal) modal.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        const row = e.target.closest('.tx-editable-row');
        if (row && row.dataset.tx) {
            try {
                const item = JSON.parse(row.dataset.tx);
                if (inputId) inputId.value = item.trade_id;
                if (inputDate) inputDate.value = item.trade_date || '';
                if (selectAcc) selectAcc.value = item.account_id || '';
                if (selectType) selectType.value = item.trade_type || '매수';
                if (selectStock) selectStock.value = item.ticker || 'CASH';
                if (inputQty) inputQty.value = item.quantity || '';
                if (inputPrice) inputPrice.value = item.unit_price || '';
                if (inputAmount) inputAmount.value = item.settle_amount || '';
                if (inputTax) inputTax.value = (item.tax !== undefined ? item.tax : item.fee) || 0;
                if (inputMemo) inputMemo.value = item.memo || '';

                if (modalTitle) modalTitle.textContent = '거래내역 수정 / 삭제';
                if (submitBtn) submitBtn.textContent = '수정 완료';
                if (btnDelete) btnDelete.classList.remove('hidden');

                toggleQtyAndPriceFields();
                if (modal) modal.classList.remove('hidden');
            } catch (err) {
                console.error("데이터 파싱 에러:", err);
            }
        }
    });

    if (selectType) {
        selectType.addEventListener('change', toggleQtyAndPriceFields);
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const isEdit = Boolean(inputId && inputId.value);
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = isEdit ? '수정 중...' : '저장 중...';
            }

            const payload = {
                trade_id: inputId.value ? Number(inputId.value) : undefined,
                trade_date: inputDate.value,
                account_id: selectAcc.value,
                trade_type: selectType.value,
                ticker: selectStock.value,
                quantity: inputQty.value ? Number(inputQty.value) : 0,
                unit_price: inputPrice.value ? Number(inputPrice.value) : 0,
                settle_amount: Number(inputAmount.value || 0),
                tax: Number(inputTax.value || 0),
                memo: inputMemo.value || ''
            };

            try {
                const res = await fetch('/api/trade', {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();

                if (result.success) {
                    closeModal();
                    await fetchD1Portfolio();
                } else {
                    alert('처리 실패: ' + (result.error || '알 수 없는 오류'));
                }
            } catch (err) {
                alert('서버 통신 오류: ' + err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = isEdit ? '수정 완료' : '내역 저장';
                }
            }
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            const tradeId = inputId.value;
            if (!tradeId) return;

            if (!confirm('정말 이 거래내역을 삭제하시겠습니까?\n삭제 시 계좌 예수금도 이전 상태로 복구됩니다.')) {
                return;
            }

            btnDelete.disabled = true;
            btnDelete.textContent = '삭제 중...';

            try {
                const res = await fetch(`/api/trade?id=${tradeId}`, {
                    method: 'DELETE'
                });
                const result = await res.json();

                if (result.success) {
                    closeModal();
                    await fetchD1Portfolio();
                } else {
                    alert('삭제 실패: ' + (result.error || '알 수 없는 오류'));
                }
            } catch (err) {
                alert('서버 통신 오류: ' + err.message);
            } finally {
                btnDelete.disabled = false;
                btnDelete.innerHTML = '<i class="fa-solid fa-trash-can"></i> 삭제하기';
            }
        });
    }
}

function setupSyncPriceButton() {
    const btn = document.getElementById('btnSyncPrices');
    const icon = document.getElementById('syncIcon');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        if (icon) icon.classList.add('fa-spin', 'text-blue-500');

        try {
            const res = await fetch('/api/sync-prices', { method: 'POST' });
            const result = await res.json();

            if (result.success) {
                if (result.dailyRates) {
                    localStorage.setItem('DAILY_RATES_CACHE', JSON.stringify(result.dailyRates));
                }
                await fetchD1Portfolio();
            }
        } catch (err) {
            console.error("동기화 중 오류:", err);
        } finally {
            btn.disabled = false;
            if (icon) icon.classList.remove('fa-spin', 'text-blue-500');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('selectAccount');
    if (select) {
        select.addEventListener('change', (e) => {
            currentAccount = e.target.value;
            fetchD1Portfolio();
        });
    }

    setupTabButtons();
    setupSyncPriceButton();
    setupTxModal();
    fetchD1Portfolio();
});