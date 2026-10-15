// port/js/app.js

let currentAccount = 'ALL';
let currentView = 'HOLDINGS';
let cachedAccounts = [];
let cachedHoldings = [];

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
        const res = await fetch(`/api/portfolio?account=${currentAccount}&view=${currentView}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // 계좌 및 종목 캐싱 (모달 콤보박스에 사용)
        cachedAccounts = data.accounts || [];
        cachedHoldings = data.holdings || [];

        // 1. 계좌 선택 드롭다운 채우기
        populateAccountOptions(cachedAccounts);

        // 2. 모달창 콤보박스 채우기
        populateModalOptions(cachedAccounts, cachedHoldings);

        // 3. 상단 요약 카드 렌더링
        if (typeof renderSummaryCard === 'function') {
            renderSummaryCard(data.summary);
        }

        // 4. 종목 데이터에 최신 일간 등락률 매핑
        const dailyRatesMap = getStoredDailyRates();
        const holdingsWithDaily = (data.holdings || []).map(h => ({
            ...h,
            daily_change_rate: dailyRatesMap[h.ticker] !== undefined ? dailyRatesMap[h.ticker] : (h.daily_change_rate || 0)
        }));

        // 5. 자산 비중 트리맵 차트 렌더링
        if (typeof renderTreemapChart === 'function') {
            renderTreemapChart(holdingsWithDaily);
        }

        // 6. 메인 테이블 및 모바일 카드 뷰 렌더링
        if (typeof renderDataTable === 'function') {
            const listToRender = currentView === 'HOLDINGS' ? holdingsWithDaily : data.logs;
            renderDataTable(currentView, listToRender);
        }

    } catch (err) {
        console.error("D1 API 호출 에러:", err);
        const tbody = document.getElementById('tableBody');
        const mobileList = document.getElementById('mobileCardList');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
        }
        if (mobileList) {
            mobileList.innerHTML = `<div class="py-8 text-center text-red-500 text-sm">DB 연동 오류: ${err.message}</div>`;
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

// 🆕 거래내역 모달 안의 '계좌'와 '종목' 콤보박스 채우기
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

        // 기본 현금 및 이자 항목
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

        // 실제 보유 및 마스터 종목 채우기 (중복 제거)
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

// 🆕 구분 선택 시 수량/단가 자동 비활성화 & 모달 동작 제어
function setupTxModal() {
    const modal = document.getElementById('txModal');
    const btnOpen = document.getElementById('btnOpenTxModal');
    const btnClose = document.getElementById('btnCloseTxModal');
    const btnCancel = document.getElementById('btnCancelTx');
    const txTypeSelect = document.getElementById('txType');
    const txStockSelect = document.getElementById('txStock');
    const inputQty = document.getElementById('txQuantity');
    const inputPrice = document.getElementById('txPrice');
    const inputDate = document.getElementById('txDate');
    const form = document.getElementById('txForm');

    // 오늘 날짜 기본 세팅 (YYYY-MM-DD)
    if (inputDate && !inputDate.value) {
        inputDate.value = new Date().toISOString().split('T')[0];
    }

    // 팝업 열기
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btnOpenTxModal')) {
            if (modal) modal.classList.remove('hidden');
        }
    });

    // 팝업 닫기
    const closeModal = () => {
        if (modal) modal.classList.add('hidden');
    };
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // 💡 구분(콤보박스) 변경 시 수량/단가 비활성화 규칙
    if (txTypeSelect) {
        txTypeSelect.addEventListener('change', () => {
            const selectedType = txTypeSelect.value;
            const noQtyTypes = ['분배금', '이자', '입금', '출금'];

            if (noQtyTypes.includes(selectedType)) {
                // 비활성화 및 값 비우기
                inputQty.disabled = true;
                inputPrice.disabled = true;
                inputQty.value = '';
                inputPrice.value = '';

                // 종목 콤보박스 추천값 자동 선택
                if (selectedType === '이자' && txStockSelect) {
                    txStockSelect.value = 'INTEREST';
                } else if ((selectedType === '입금' || selectedType === '출금') && txStockSelect) {
                    txStockSelect.value = 'CASH';
                }
            } else {
                // 매수, 매도일 때는 활성화
                inputQty.disabled = false;
                inputPrice.disabled = false;
            }
        });
    }

    // 폼 제출(저장) 이벤트
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('btnSubmitTx');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '저장 중...';
            }

            const payload = {
                trade_date: inputDate.value,
                account_id: document.getElementById('txAccount').value,
                trade_type: txTypeSelect.value,
                ticker: txStockSelect.value,
                quantity: inputQty.value ? Number(inputQty.value) : 0,
                unit_price: inputPrice.value ? Number(inputPrice.value) : 0,
                settle_amount: Number(document.getElementById('txAmount').value || 0),
                tax: Number(document.getElementById('txTax').value || 0),
                memo: document.getElementById('txMemo').value || ''
            };

            try {
                const res = await fetch('/api/trade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();

                if (result.success) {
                    closeModal();
                    form.reset();
                    // 오늘 날짜 재설정
                    inputDate.value = new Date().toISOString().split('T')[0];
                    // 화면 즉시 새로고침
                    await fetchD1Portfolio();
                } else {
                    alert('저장 실패: ' + (result.error || '알 수 없는 오류'));
                }
            } catch (err) {
                alert('서버 통신 오류: ' + err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '내역 저장';
                }
            }
        });
    }
}

function setupTabButtons() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => {
                b.className = 'tab-btn px-2.5 py-1.5 rounded-lg transition text-slate-500 hover:text-slate-800 whitespace-nowrap';
            });
            btn.className = 'tab-btn px-2.5 py-1.5 rounded-lg transition bg-white shadow-sm text-blue-600 font-bold whitespace-nowrap';

            currentView = btn.getAttribute('data-view');
            fetchD1Portfolio();
        });
    });
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