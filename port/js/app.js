// port/js/app.js
let currentAccount = 'ALL';
let currentView = 'OVERVIEW';
let cachedAccounts = [];
let cachedHoldings = [];
let cachedLogs = [];
let cachedSummary = null;

const ACCOUNT_OCR_MAP = [
    { pattern: '80-0', accountId: 'MIRAE_PENSION', name: '미래-연금' },
    { pattern: '40-0', accountId: 'MIRAE_01', name: '미래에셋' },
    { pattern: '-14', accountId: 'SAMSUNG_ISA', name: '삼성-ISA' },
    { pattern: '-01', accountId: 'SAMSUNG_GEN', name: '삼성-일반' },
    { pattern: '-15', accountId: 'SAMSUNG_PENSION', name: '삼성-연금' },
    { pattern: '-05', accountId: 'SAMSUNG_CMA', name: '삼성-CMA' }
];

function getStoredDailyRates() {
    try {
        return JSON.parse(localStorage.getItem('DAILY_RATES_CACHE') || '{}');
    } catch (_) {
        return {};
    }
}

function formatKstDateTime(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function updateSyncTooltipDisplay(serverTime) {
    const timeEl = document.getElementById('syncTooltipTime');
    if (!timeEl) return;
    if (serverTime) {
        timeEl.textContent = serverTime;
        localStorage.setItem('PORTFOLIO_LAST_SYNC', serverTime);
    } else {
        timeEl.textContent = localStorage.getItem('PORTFOLIO_LAST_SYNC') || '확인 중...';
    }
}

async function fetchD1Portfolio() {
    try {
        const apiView = currentView === 'OVERVIEW' ? 'HOLDINGS' : currentView;
        const res = await fetch(`/api/portfolio?account=${currentAccount}&view=${apiView}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        cachedAccounts = data.accounts || [];
        cachedHoldings = data.holdings || [];
        cachedLogs = data.logs || [];
        cachedSummary = data.summary || {};

        if (data.lastSyncTime) {
            updateSyncTooltipDisplay(formatKstDateTime(data.lastSyncTime));
        } else if (data.summary && data.summary.lastUpdated) {
            updateSyncTooltipDisplay(formatKstDateTime(data.summary.lastUpdated));
        }

        populateAccountOptions(cachedAccounts);
        populateModalOptions(cachedAccounts, cachedHoldings);

        if (typeof renderSummaryCard === 'function') {
            renderSummaryCard(data.summary, data.chartData);
        }

        const dailyRatesMap = getStoredDailyRates();
        const holdingsWithDaily = cachedHoldings.map(h => ({
            ...h,
            daily_change_rate: dailyRatesMap[h.ticker] !== undefined ? dailyRatesMap[h.ticker] : (h.daily_change_rate || 0)
        }));

        if (typeof renderTreemapChart === 'function') {
            renderTreemapChart(holdingsWithDaily);
        }

        const totalNetWorth = Number(cachedSummary.netWorth) || 0;
        const cashBalance = Number(cachedSummary.cashBalance) || 0;

        let tableDisplayHoldings = holdingsWithDaily.map(item => {
            const itemEval = Number(item.eval_amount) || 0;
            const weightAgainstNetWorth = totalNetWorth > 0 ? Number(((itemEval / totalNetWorth) * 100).toFixed(2)) : 0;
            return {
                ...item,
                weight: weightAgainstNetWorth
            };
        });

        if (cashBalance > 0) {
            const cashWeight = totalNetWorth > 0 ? Number(((cashBalance / totalNetWorth) * 100).toFixed(2)) : 0;
            
            let accName = '전체 계좌';
            if (currentAccount !== 'ALL') {
                const found = cachedAccounts.find(a => a.account_id === currentAccount);
                if (found) accName = found.account_name;
            }

            const isRebalanceAccount = (currentAccount === 'MIRAE_PENSION') || 
                                       (currentAccount === 'SAMSUNG_ISA') || 
                                       (accName && (accName.includes('연금') || accName.includes('ISA'))) || 
                                       (currentAccount && (currentAccount.includes('연금') || currentAccount.includes('ISA')));

            let cashTargetWeight = null;
            let cashBandMin = null;
            let cashBandMax = null;
            let cashStatus = '유지';
            let cashDiffAmount = 0;

            if (isRebalanceAccount) {
                const cashDbSetting = data.rebalanceCashSetting || {};

                cashTargetWeight = (cashDbSetting.target_weight !== undefined && cashDbSetting.target_weight !== null)
                    ? Number(cashDbSetting.target_weight)
                    : 10.0;

                cashBandMin = (cashDbSetting.band_min !== undefined && cashDbSetting.band_min !== null)
                    ? Number(cashDbSetting.band_min)
                    : Math.max(0, Number((cashTargetWeight - 2.0).toFixed(2)));

                cashBandMax = (cashDbSetting.band_max !== undefined && cashDbSetting.band_max !== null)
                    ? Number(cashDbSetting.band_max)
                    : Number((cashTargetWeight + 2.0).toFixed(2));

                if (cashWeight < cashBandMin) {
                    cashStatus = '매수';
                } else if (cashWeight > cashBandMax) {
                    cashStatus = '매도';
                } else {
                    cashStatus = '유지';
                }

                const targetCashVal = totalNetWorth * (cashTargetWeight / 100.0);
                cashDiffAmount = Math.round(targetCashVal - cashBalance);
            }

            tableDisplayHoldings.push({
                holding_id: 'CASH_VIRTUAL',
                account_id: currentAccount,
                account_name: accName,
                ticker: 'CASH',
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

        applyViewSwitching(tableDisplayHoldings);

    } catch (err) {
        console.error("D1 API 호출 에러:", err);
        const tbody = document.getElementById('tableBody');
        const mobileList = document.getElementById('mobileCardList');
        if (tbody) tbody.innerHTML = `<tr><td colspan="14" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div class="py-8 text-center text-red-500 text-sm">DB 연동 오류: ${err.message}</div>`;
    }
}

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

// 💡 [수정] 새 계좌 추가 후 즉시 재렌더링되도록 콤보박스 갱신 로직 유연화
function populateAccountOptions(accounts) {
    const select = document.getElementById('selectAccount');
    if (!select) return;

    const currentVal = currentAccount || select.value || 'ALL';
    select.innerHTML = '<option value="ALL">전체 계좌 종합</option>';

    accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.account_id;
        opt.textContent = acc.account_name;
        if (acc.account_id === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function populateModalOptions(accounts, holdings) {
    const accountSelect = document.getElementById('txAccount');
    const stockSelect = document.getElementById('txStock');

    if (accountSelect) {
        const curVal = accountSelect.value;
        accountSelect.innerHTML = '';
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.account_id;
            opt.textContent = acc.account_name;
            if (acc.account_id === curVal) opt.selected = true;
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
            if (h.ticker && h.ticker !== 'CASH' && h.ticker !== '현금' && !uniqueStocks.has(h.ticker)) {
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

// 💡 네이버 증권 종목 실시간 검색 및 콤보박스 연동 엔진 (최신 원본 100% 보존)
function setupStockSearchEngine() {
    const btnToggle = document.getElementById('btnToggleStockSearch');
    const searchPanel = document.getElementById('stockSearchPanel');
    const btnClose = document.getElementById('btnCloseStockSearch');
    const inputKeyword = document.getElementById('inputStockKeyword');
    const resultsContainer = document.getElementById('stockSearchResults');
    const stockSelect = document.getElementById('txStock');
    const hiddenStockName = document.getElementById('txStockName');

    if (!btnToggle || !searchPanel || !inputKeyword || !resultsContainer || !stockSelect) return;

    let debounceTimer = null;

    const openSearchPanel = () => {
        searchPanel.classList.remove('hidden');
        inputKeyword.value = '';
        resultsContainer.innerHTML = '<div class="py-4 text-center text-slate-400 text-[11px]">한글 종목명을 2글자 이상 입력하세요</div>';
        setTimeout(() => inputKeyword.focus(), 100);
    };

    const closeSearchPanel = () => {
        searchPanel.classList.add('hidden');
    };

    btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchPanel.classList.contains('hidden')) {
            openSearchPanel();
        } else {
            closeSearchPanel();
        }
    });

    if (btnClose) {
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeSearchPanel();
        });
    }

    document.addEventListener('click', (e) => {
        if (!searchPanel.contains(e.target) && !btnToggle.contains(e.target)) {
            closeSearchPanel();
        }
    });

    inputKeyword.addEventListener('input', () => {
        const query = inputKeyword.value.trim();

        if (debounceTimer) clearTimeout(debounceTimer);

        if (query.length < 2) {
            resultsContainer.innerHTML = '<div class="py-4 text-center text-slate-400 text-[11px]">한글 종목명을 2글자 이상 입력하세요</div>';
            return;
        }

        debounceTimer = setTimeout(async () => {
            resultsContainer.innerHTML = '<div class="py-4 text-center text-blue-600 text-[11px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i>네이버에서 검색 중...</div>';

            try {
                const res = await fetch(`/api/search-stock?q=${encodeURIComponent(query)}`);
                const data = await res.json();

                if (!data.success) {
                    throw new Error(data.error || '검색 실패');
                }

                const items = data.items || [];
                if (items.length === 0) {
                    resultsContainer.innerHTML = '<div class="py-4 text-center text-slate-400 text-[11px]">검색 결과가 없습니다.</div>';
                    return;
                }

                resultsContainer.innerHTML = items.map(item => `
                    <div class="stock-search-item px-2.5 py-2 hover:bg-blue-50 cursor-pointer rounded-lg flex items-center justify-between transition"
                         data-ticker="${item.ticker}" data-name="${item.name}">
                        <div class="flex items-center gap-1.5 overflow-hidden">
                            <span class="font-bold text-slate-800 truncate">${item.name}</span>
                            <span class="text-[10px] text-slate-400 font-mono">(${item.ticker})</span>
                        </div>
                        <span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">${item.market}</span>
                    </div>
                `).join('');

                const itemElements = resultsContainer.querySelectorAll('.stock-search-item');
                itemElements.forEach(el => {
                    el.addEventListener('click', () => {
                        const ticker = el.dataset.ticker;
                        const name = el.dataset.name;

                        if (hiddenStockName) hiddenStockName.value = name;

                        let foundOption = false;
                        for (let i = 0; i < stockSelect.options.length; i++) {
                            if (stockSelect.options[i].value === ticker) {
                                stockSelect.selectedIndex = i;
                                foundOption = true;
                                break;
                            }
                        }

                        if (!foundOption) {
                            const newOption = document.createElement('option');
                            newOption.value = ticker;
                            newOption.textContent = `${name} (${ticker}) [신규]`;
                            stockSelect.appendChild(newOption);
                            stockSelect.value = ticker;
                        }

                        closeSearchPanel();
                    });
                });

            } catch (err) {
                resultsContainer.innerHTML = `<div class="py-4 text-center text-red-500 text-[11px]">검색 오류: ${err.message}</div>`;
            }
        }, 300);
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
    const hiddenStockName = document.getElementById('txStockName');
    const inputDate = document.getElementById('txDate');
    const selectAcc = document.getElementById('txAccount');
    const selectType = document.getElementById('txType');
    const selectStock = document.getElementById('txStock');
    const inputQty = document.getElementById('txQuantity');
    const inputPrice = document.getElementById('txPrice');
    const inputAmount = document.getElementById('txAmount');
    const inputTax = document.getElementById('txTax');
    const inputMemo = document.getElementById('txMemo');

    const btnModalOcr = document.getElementById('btnModalOcrUpload');
    const fileInput = document.getElementById('ocrFileInput');

    if (btnModalOcr && fileInput) {
        btnModalOcr.addEventListener('click', () => {
            fileInput.click();
        });
    }

    const closeModal = () => {
        if (modal) modal.classList.add('hidden');
        const searchPanel = document.getElementById('stockSearchPanel');
        if (searchPanel) searchPanel.classList.add('hidden');
    };
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    document.addEventListener('click', (e) => {
        if (e.target.closest('#btnOpenTxModal')) {
            if (form) form.reset();
            if (inputId) inputId.value = '';
            if (hiddenStockName) hiddenStockName.value = '';
            if (inputDate) inputDate.value = new Date().toISOString().split('T')[0];
            if (inputTax) inputTax.value = '0';
            if (modalTitle) modalTitle.textContent = '거래내역 직접 입력';
            if (submitBtn) submitBtn.textContent = '내역 저장';
            if (btnDelete) btnDelete.classList.add('hidden');
            if (btnModalOcr) btnModalOcr.classList.remove('hidden');
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
                if (hiddenStockName) hiddenStockName.value = item.display_asset_name || '';
                if (inputDate) inputDate.value = item.trade_date || '';
                if (selectAcc) selectAcc.value = item.account_id || '';
                if (selectType) selectType.value = item.trade_type || '매수';
                if (selectStock) selectStock.value = item.ticker || 'CASH';
                if (inputQty) inputQty.value = item.quantity || '';
                if (inputPrice) inputPrice.value = item.unit_price || '';
                if (inputAmount) inputAmount.value = item.settle_amount || '';

                const loadedTax = (item.fee !== undefined && item.fee !== null) ? item.fee : (item.tax || 0);
                if (inputTax) inputTax.value = Number(loadedTax);

                if (inputMemo) inputMemo.value = item.memo || '';

                if (modalTitle) modalTitle.textContent = '거래내역 수정 / 삭제';
                if (submitBtn) submitBtn.textContent = '수정 완료';
                if (btnDelete) btnDelete.classList.remove('hidden');
                if (btnModalOcr) btnModalOcr.classList.add('hidden');

                toggleQtyAndPriceFields();
                if (modal) modal.classList.remove('hidden');
            } catch (err) {
                console.error("데이터 파싱 에러:", err);
            }
        }
    });

    const autoCalcAmount = () => {
        if (['매수', '매도'].includes(selectType.value)) {
            const q = Number(inputQty.value) || 0;
            const p = Number(inputPrice.value) || 0;
            if (q > 0 && p > 0) {
                inputAmount.value = q * p;
            }
        }
    };
    if (inputQty) inputQty.addEventListener('input', autoCalcAmount);
    if (inputPrice) inputPrice.addEventListener('input', autoCalcAmount);

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

            let selectedStockName = '';
            if (hiddenStockName && hiddenStockName.value) {
                selectedStockName = hiddenStockName.value;
            } else if (selectStock && selectStock.selectedOptions.length > 0) {
                selectedStockName = selectStock.selectedOptions[0].text.split('(')[0].trim();
            }

            const payload = {
                trade_id: inputId.value ? Number(inputId.value) : undefined,
                trade_date: inputDate.value,
                account_id: selectAcc.value,
                trade_type: selectType.value,
                ticker: selectStock.value,
                stock_name: selectedStockName,
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

// 💡 [신규 추가] 계좌 직접 추가 모달 제어 및 API 통신 엔진
function setupAddAccountModal() {
    const modal = document.getElementById('addAccountModal');
    const btnOpen = document.getElementById('btnOpenAddAccountModal');
    const btnClose = document.getElementById('btnCloseAddAccountModal');
    const btnCancel = document.getElementById('btnCancelAddAccount');
    const form = document.getElementById('addAccountForm');
    const inputName = document.getElementById('newAccountName');
    const inputBroker = document.getElementById('newAccountBroker');
    const selectType = document.getElementById('newAccountType');
    const errBox = document.getElementById('addAccountError');
    const btnSubmit = document.getElementById('btnSubmitAddAccount');

    if (!modal) return;

    const openModal = () => {
        if (form) form.reset();
        if (errBox) errBox.classList.add('hidden');
        modal.classList.remove('hidden');
        setTimeout(() => inputName && inputName.focus(), 100);
    };

    const closeModal = () => {
        modal.classList.add('hidden');
    };

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const account_name = inputName.value.trim();
            const broker = inputBroker.value.trim();
            const account_type = selectType.value;

            if (!account_name) {
                if (errBox) {
                    errBox.textContent = '계좌명을 입력해 주세요.';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = '개설 중...';
            }
            if (errBox) errBox.classList.add('hidden');

            try {
                const res = await fetch('/api/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_name, broker, account_type })
                });
                const result = await res.json();

                if (result.success) {
                    closeModal();
                    if (result.account && result.account.account_id) {
                        currentAccount = result.account.account_id;
                    }
                    await fetchD1Portfolio();
                    alert(result.message || '새 계좌가 등록되었습니다!');
                } else {
                    if (errBox) {
                        errBox.textContent = result.error || '계좌 등록 실패';
                        errBox.classList.remove('hidden');
                    }
                }
            } catch (err) {
                if (errBox) {
                    errBox.textContent = '통신 에러: ' + err.message;
                    errBox.classList.remove('hidden');
                }
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = '계좌 개설';
                }
            }
        });
    }
}

function setupOcrEngine() {
    const fileInput = document.getElementById('ocrFileInput');
    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const overlay = document.getElementById('ocrLoadingOverlay');
        const progressText = document.getElementById('ocrProgressText');
        const progressBar = document.getElementById('ocrProgressBar');

        if (overlay) overlay.classList.remove('hidden');
        if (progressText) progressText.textContent = '이미지 분석 엔진 준비 중...';
        if (progressBar) progressBar.style.width = '10%';

        try {
            if (typeof Tesseract === 'undefined') {
                throw new Error('OCR 엔진 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
            }

            const { data: { text } } = await Tesseract.recognize(
                file,
                'kor+eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text' && progressBar) {
                            const pct = Math.round(m.progress * 100);
                            progressBar.style.width = `${pct}%`;
                            progressText.textContent = `글자를 판독하는 중입니다... (${pct}%)`;
                        }
                    }
                }
            );

            populateFieldsFromOcr(text);

        } catch (err) {
            console.error('OCR 실패:', err);
            alert('이미지 인식 중 오류가 발생했습니다: ' + err.message);
        } finally {
            if (overlay) overlay.classList.add('hidden');
            fileInput.value = '';
        }
    });
}

function populateFieldsFromOcr(rawText) {
    const cleanText = rawText.replace(/\s+/g, ' ');
    const noSpaceText = rawText.replace(/[\s\r\n\t]/g, '');

    let detectedAccountId = '';
    if (/[-*]01\b|[-*]01\D/.test(cleanText) || noSpaceText.includes('-01') || noSpaceText.includes('*****01')) {
        detectedAccountId = 'SAMSUNG_GEN';
    } else if (/[-*]14\b|[-*]14\D/.test(cleanText) || noSpaceText.includes('-14') || noSpaceText.includes('*****14')) {
        detectedAccountId = 'SAMSUNG_ISA';
    } else if (/[-*]15\b|[-*]15\D/.test(cleanText) || noSpaceText.includes('-15') || noSpaceText.includes('*****15')) {
        detectedAccountId = 'SAMSUNG_PENSION';
    } else if (/[-*]05\b|[-*]05\D/.test(cleanText) || noSpaceText.includes('-05') || noSpaceText.includes('*****05')) {
        detectedAccountId = 'SAMSUNG_CMA';
    } else if (/80-0/.test(cleanText) || noSpaceText.includes('80-0')) {
        detectedAccountId = 'MIRAE_PENSION';
    } else if (/40-0/.test(cleanText) || noSpaceText.includes('40-0')) {
        detectedAccountId = 'MIRAE_01';
    }

    let detectedDate = new Date().toISOString().split('T')[0];
    const dateMatch = cleanText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
        const y = dateMatch[1];
        const m = String(dateMatch[2]).padStart(2, '0');
        const d = String(dateMatch[3]).padStart(2, '0');
        detectedDate = `${y}-${m}-${d}`;
    }

    let detectedTicker = '';
    let detectedName = '';
    const stockSelect = document.getElementById('txStock');

    const codeMatch = cleanText.match(/A([0-9A-Z]{6})\b/i) || noSpaceText.match(/A([0-9A-Z]{6})/i);
    let strippedTicker = codeMatch ? codeMatch[1].toUpperCase() : '';

    if (stockSelect) {
        if (strippedTicker) {
            for (let i = 0; i < stockSelect.options.length; i++) {
                if (stockSelect.options[i].value.toUpperCase() === strippedTicker) {
                    detectedTicker = stockSelect.options[i].value;
                    detectedName = stockSelect.options[i].text.split('(')[0].trim();
                    break;
                }
            }
        }

        if (!detectedTicker) {
            let rawTargetName = '';
            const nameBlockMatch = cleanText.match(/(?:종목명|ETF분배금)\s*[:：]?\s*([^\n\r]+)/);
            if (nameBlockMatch) {
                rawTargetName = nameBlockMatch[1].replace(/[\s\r\n\t\-_:：]/g, '');
            } else {
                rawTargetName = noSpaceText;
            }

            const searchSlice13 = rawTargetName.substring(0, 13);
            const searchSlice8 = rawTargetName.substring(0, 8);

            for (let i = 0; i < stockSelect.options.length; i++) {
                const optVal = stockSelect.options[i].value;
                const optRawText = stockSelect.options[i].text;
                const optCleanName = optRawText.split('(')[0].replace(/[\s\r\n\t\-_:：]/g, '');

                if (optVal === 'CASH' || optVal === 'INTEREST') continue;

                const isMatch = (
                    (searchSlice13.length >= 6 && optCleanName.includes(searchSlice13)) ||
                    (optCleanName.length >= 6 && searchSlice13.includes(optCleanName.substring(0, 13))) ||
                    (searchSlice8.length >= 6 && optCleanName.includes(searchSlice8)) ||
                    noSpaceText.includes(optCleanName.substring(0, 8))
                );

                if (isMatch) {
                    detectedTicker = optVal;
                    detectedName = optRawText.split('(')[0].trim();
                    break;
                }
            }
        }
    }

    const extractAmount = (regex) => {
        const match = cleanText.match(regex);
        if (!match) return 0;
        const numStr = match[1].replace(/[^0-9]/g, '');
        return Number(numStr) || 0;
    };

    let totalTax = 0;
    const singleTax = extractAmount(/(?:^|\s)세\s*금\s*[:：]?\s*([0-9,]+)\s*원/);
    if (singleTax > 0) {
        totalTax = singleTax;
    } else {
        const incTax = extractAmount(/소득세\s*[:：]?\s*([0-9,]+)\s*원/);
        const locTax = extractAmount(/지방소득세\s*[:：]?\s*([0-9,]+)\s*원/);
        totalTax = incTax + locTax;
    }

    let grossAmount = 0;
    const grossPatternMatch = cleanText.match(/(?:배정금액|세전\s*분배금액)[^0-9]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
    if (grossPatternMatch) {
        grossAmount = Number(grossPatternMatch[1].replace(/[^0-9]/g, '')) || 0;
    } else {
        grossAmount = extractAmount(/(?:배정금액|세전\s*분배금액)\s*[:：]?\s*([0-9,]+)\s*원/);
    }

    const inputDate = document.getElementById('txDate');
    const selectAcc = document.getElementById('txAccount');
    const selectType = document.getElementById('txType');
    const inputAmount = document.getElementById('txAmount');
    const inputTax = document.getElementById('txTax');
    const inputMemo = document.getElementById('txMemo');
    const modalTitle = document.getElementById('txModalTitle');

    if (inputDate) inputDate.value = detectedDate;
    if (selectAcc && detectedAccountId) selectAcc.value = detectedAccountId;
    if (selectType) selectType.value = '분배금';
    
    if (stockSelect && detectedTicker) {
        stockSelect.value = detectedTicker;
    }
    
    if (inputAmount) inputAmount.value = grossAmount || '';
    if (inputTax) inputTax.value = totalTax;

    const monthStr = detectedDate.split('-')[1] || '';
    const cleanMonth = monthStr ? Number(monthStr) + '월 ' : '';
    if (inputMemo) {
        inputMemo.value = detectedName ? `${detectedName} ${cleanMonth}분배금` : '분배금 입금';
    }

    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-emerald-600 mr-1.5"></i> 이미지 인식 완료 (확인 후 저장)';
    }

    toggleQtyAndPriceFields();
}

function setupSyncPriceButton() {
    const btn = document.getElementById('btnSyncPrices');
    const icon = document.getElementById('syncIcon');
    const tooltip = document.getElementById('syncTooltip');
    const timeEl = document.getElementById('syncTooltipTime');
    if (!btn || !tooltip) return;

    let tooltipTimeout = null;
    let isTooltipVisible = false;

    const updateTooltipText = (savedTime) => {
        updateSyncTooltipDisplay(savedTime);
    };

    updateTooltipText();

    const showTooltip = () => {
        updateTooltipText();
        tooltip.classList.remove('hidden');
        isTooltipVisible = true;

        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
            hideTooltip();
        }, 2000);
    };

    const hideTooltip = () => {
        tooltip.classList.add('hidden');
        isTooltipVisible = false;
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }
    };

    const executeSyncAction = async () => {
        btn.disabled = true;
        if (icon) icon.classList.add('fa-spin', 'text-blue-500');

        try {
            const res = await fetch('/api/sync-prices', { method: 'POST' });
            const result = await res.json();

            fetch('/api/snapshot-daily', { method: 'POST' }).catch(() => {});

            if (result.success) {
                if (result.dailyRates) {
                    localStorage.setItem('DAILY_RATES_CACHE', JSON.stringify(result.dailyRates));
                }
                const currentSyncTime = formatKstDateTime(result.updatedAt);
                updateSyncTooltipDisplay(currentSyncTime);

                showTooltip();
                await fetchD1Portfolio();
            }
        } catch (err) {
            console.error("동기화 중 오류:", err);
        } finally {
            btn.disabled = false;
            if (icon) icon.classList.remove('fa-spin', 'text-blue-500');
        }
    };

    btn.addEventListener('mouseenter', () => {
        if (!window.matchMedia('(pointer: coarse)').matches) {
            showTooltip();
        }
    });

    btn.addEventListener('mouseleave', () => {
        if (!window.matchMedia('(pointer: coarse)').matches) {
            hideTooltip();
        }
    });

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const isMobileTouch = window.matchMedia('(pointer: coarse)').matches;

        if (isMobileTouch) {
            if (!isTooltipVisible) {
                showTooltip();
                return;
            } else {
                hideTooltip();
                await executeSyncAction();
                return;
            }
        }

        await executeSyncAction();
    });

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !tooltip.contains(e.target)) {
            hideTooltip();
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
    setupStockSearchEngine(); // 💡 네이버 실시간 종목 검색 엔진 유지
    setupTxModal();
    setupAddAccountModal();   // 💡 신규 계좌 직접 추가 모달 연동
    setupOcrEngine();
    fetchD1Portfolio();
});