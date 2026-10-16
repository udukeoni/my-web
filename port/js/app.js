// port/js/app.js

let currentAccount = 'ALL';
let currentView = 'OVERVIEW'; // 💡 기본값을 '자산 현황(OVERVIEW)'으로 설정
let cachedAccounts = [];
let cachedHoldings = [];
let cachedLogs = [];

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
        // 자산 현황일 때도 테이블 데이터는 미리 불러와서 대기시킴
        const apiView = currentView === 'OVERVIEW' ? 'HOLDINGS' : currentView;
        const res = await fetch(`/api/portfolio?account=${currentAccount}&view=${apiView}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // 계좌, 종목, 거래로그 캐싱
        cachedAccounts = data.accounts || [];
        cachedHoldings = data.holdings || [];
        cachedLogs = data.logs || [];

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

        // 5. 자산 비중 트리맵 차트 렌더링
        if (typeof renderTreemapChart === 'function') {
            renderTreemapChart(holdingsWithDaily);
        }

        // 6. 화면 스위칭 및 테이블 렌더링
        applyViewSwitching(holdingsWithDaily);

    } catch (err) {
        console.error("D1 API 호출 에러:", err);
        const tbody = document.getElementById('tableBody');
        const mobileList = document.getElementById('mobileCardList');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
        }
        if (mobileList) {
            mobileList.innerHTML = `<div class="py-8 text-center text-red-500 text-sm">DB 연동 오류: ${err.message}</div>`;
        }
    }
}

// 💡 [핵심] 자산현황 ↔ 상세 테이블 동적 전환(스위칭) 함수
function applyViewSwitching(holdingsData) {
    const overviewBox = document.getElementById('overviewContainer');
    const tableBox = document.getElementById('tableContainer');

    if (currentView === 'OVERVIEW') {
        // [자산 현황] 탭: 총자산 카드 + 자산 비중 트리맵 노출, 테이블 숨김
        if (overviewBox) overviewBox.classList.remove('hidden');
        if (tableBox) tableBox.classList.add('hidden');
    } else {
        // [종목 잔고 / 전체 내역 / 매매 / 배당 / 입출금] 탭: 총자산/트리맵 닫고 테이블 노출
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
            if (h.ticker && !uniqueStocks.has(h.ticker)) {
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

// 탭 버튼 클릭 이벤트 (6대 탭 스타일 및 스위칭 제어)
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

// 거래내역 모달 이벤트
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