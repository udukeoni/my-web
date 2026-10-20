// port/js/app.js
// 계좌 선택, 탭 스위칭, 밴드리밸런싱 데이터 보존, 거래 모달 + OCR 이미지 인식(종목 정밀 매칭 및 세후 정산금 연동)

let currentAccount = 'ALL';
let currentView = 'OVERVIEW'; // 기본값을 '자산 현황(OVERVIEW)'으로 설정
let cachedAccounts = [];
let cachedHoldings = [];
let cachedLogs = [];
let cachedSummary = null;

// 사용자 지정 증권사 계좌번호 식별 매핑 규칙
const ACCOUNT_OCR_MAP = [
    { pattern: '80-0', accountId: 'MIRAE_PENSION', name: '미래-연금' },
    { pattern: '40-0', accountId: 'MIRAE_01', name: '미래에셋' },
    { pattern: '-14', accountId: 'SAMSUNG_ISA', name: '삼성-ISA' },
    { pattern: '-01', accountId: 'SAMSUNG_GEN', name: '삼성-일반' },
    { pattern: '-15', accountId: 'SAMSUNG_PENSION', name: '삼성-연금' },
    { pattern: '-05', accountId: 'SAMSUNG_CMA', name: '삼성-CMA' }
];

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

        // 6. 리밸런싱 속성(target_weight, band_min/max 등)을 온전히 유지하며 비중 재계산
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

        // 7. 예수금(CASH) 가상 종목 추가 시 밴드리밸런싱 연산 보존
        if (cashBalance > 0) {
            const cashWeight = totalNetWorth > 0 ? Number(((cashBalance / totalNetWorth) * 100).toFixed(2)) : 0;
            
            let accName = '전체 계좌';
            if (currentAccount !== 'ALL') {
                const found = cachedAccounts.find(a => a.account_id === currentAccount);
                if (found) accName = found.account_name;
            }

            let cashTargetWeight = null;
            let cashBandMin = null;
            let cashBandMax = null;
            let cashStatus = '유지';
            let cashDiffAmount = 0;

            const isPensionAccount = (currentAccount === 'MIRAE_PENSION') || 
                                     (accName && accName.includes('연금')) || 
                                     (currentAccount && currentAccount.includes('연금'));

            if (isPensionAccount) {
                cashTargetWeight = 10.0;
                cashBandMin = 8.0;
                cashBandMax = 12.0;

                if (cashWeight < cashBandMin) {
                    cashStatus = '매수';
                } else if (cashWeight > cashBandMax) {
                    cashStatus = '매도';
                } else {
                    cashStatus = '유지';
                }

                const targetCashVal = totalNetWorth * 0.10;
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

// 거래내역 모달 및 OCR 파싱 연동 컨트롤러
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

    // 모달 좌측 하단 이미지 업로드 버튼 및 파일 인풋
    const btnModalOcr = document.getElementById('btnModalOcrUpload');
    const fileInput = document.getElementById('ocrFileInput');

    if (btnModalOcr && fileInput) {
        btnModalOcr.addEventListener('click', () => {
            fileInput.click();
        });
    }

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

// 브라우저 클라이언트 OCR 엔진 및 텍스트 자동 파싱
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

// 💡 텍스트 정밀 매칭 및 입력 폼 자동 채우기
function populateFieldsFromOcr(rawText) {
    // 모든 줄바꿈과 연속 공백을 단일 공백으로 치환하고, 비교용 노이즈 제거 텍스트 생성
    const cleanText = rawText.replace(/\s+/g, ' ');
    const noSpaceText = rawText.replace(/[\s\r\n\t\-_:：]/g, ''); // 띄어쓰기/특수문자 100% 제거 문자열

    // 1. 계좌 식별 (80-0, 40-0, -14, -01, -15, -05)
    let detectedAccountId = '';
    for (const rule of ACCOUNT_OCR_MAP) {
        if (cleanText.includes(rule.pattern) || noSpaceText.includes(rule.pattern.replace(/[^0-9a-zA-Z]/g, ''))) {
            detectedAccountId = rule.accountId;
            break;
        }
    }

    // 2. 일자 추출 (삼성증권: '2026년 10월 15일' 등)
    let detectedDate = new Date().toISOString().split('T')[0];
    const dateMatch = cleanText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
        const y = dateMatch[1];
        const m = String(dateMatch[2]).padStart(2, '0');
        const d = String(dateMatch[3]).padStart(2, '0');
        detectedDate = `${y}-${m}-${d}`;
    }

    // 3. 💡 [핵심 버그 수정] 종목(티커) 정밀 정규화 매칭 알고리즘
    let detectedTicker = '';
    let detectedName = '';

    // 3-1) 미래에셋 영문+숫자 6자리 코드 우선 탐색 (예: A495050, A441640, A0008S0)
    const tickerMatch = cleanText.match(/A([0-9A-Z]{6})/i);
    if (tickerMatch) {
        detectedTicker = tickerMatch[1].toUpperCase();
    } else {
        // 3-2) 삼성증권 종목명 정밀 다중 키워드 매칭
        const stockSelect = document.getElementById('txStock');
        if (stockSelect) {
            // 주요 ETF 패턴 맵핑 테이블 (공백/오타 무관 정규화)
            const targetKeywords = [
                { pattern: /200.*(?:타겟|타켓)?.*위클리/i, name: 'KODEX 200타겟위클리커버드콜' },
                { pattern: /미국배당.*커버드콜.*액티브/i, name: 'KODEX 미국배당커버드콜액티브' },
                { pattern: /미국배당.*다우존스.*타겟/i, name: 'TIGER 미국배당다우존스타겟데일리커버드' },
                { pattern: /미국나스닥.*100.*타겟/i, name: 'TIGER 미국나스닥100타겟데일리커버드콜' },
                { pattern: /미국AI.*밸류체인/i, name: 'RISE 미국AI밸류체인데일리고정커버드콜' },
                { pattern: /국제금.*커버드콜/i, name: 'SOL 국제금커버드콜액티브' },
                { pattern: /30년.*국채.*커버드콜/i, name: 'SOL 미국30년국채커버드콜(합성)' },
                { pattern: /코리아.*밸류업/i, name: 'RISE 코리아밸류업' },
                { pattern: /미국.*S&P.*500/i, name: 'KODEX 미국S&P500' }
            ];

            let matchedKeywordName = '';
            for (const item of targetKeywords) {
                if (item.pattern.test(noSpaceText) || item.pattern.test(cleanText)) {
                    matchedKeywordName = item.name;
                    break;
                }
            }

            // 드롭다운 옵션 중에서 일치하는 종목의 티커(value) 추출
            for (let i = 0; i < stockSelect.options.length; i++) {
                const optVal = stockSelect.options[i].value;
                const optText = stockSelect.options[i].text.replace(/[\s\r\n\t\-_:：]/g, '');

                if (optVal === 'CASH' || optVal === 'INTEREST') continue; // 원화현금/이자는 매칭에서 원천 배제

                if (matchedKeywordName && optText.includes(matchedKeywordName.replace(/[\s\r\n\t\-_:：]/g, ''))) {
                    detectedTicker = optVal;
                    detectedName = stockSelect.options[i].text.split('(')[0].trim();
                    break;
                }
            }
        }
    }

    // 4. 세금 파싱 (단일 세금 또는 소득세 + 지방소득세)
    let totalTax = 0;
    const taxSingleMatch = cleanText.match(/세금\s*[:：]?\s*([\d,]+)\s*원/);
    if (taxSingleMatch) {
        totalTax = Number(taxSingleMatch[1].replace(/,/g, '')) || 0;
    } else {
        const incomeTaxMatch = cleanText.match(/소득세\s*[:：]?\s*([\d,]+)\s*원/);
        const localTaxMatch = cleanText.match(/지방소득세\s*[:：]?\s*([\d,]+)\s*원/);
        const incTax = incomeTaxMatch ? (Number(incomeTaxMatch[1].replace(/,/g, '')) || 0) : 0;
        const locTax = localTaxMatch ? (Number(localTaxMatch[1].replace(/,/g, '')) || 0) : 0;
        totalTax = incTax + locTax;
    }

    // 5. 금액 파싱 및 세후 정산금액 산출 (실제 내 계좌에 들어오는 순입금액)
    let netSettleAmount = 0;
    const netMatch = cleanText.match(/세후\s*분배금액\s*[:：]?\s*([\d,]+)\s*원/);
    if (netMatch) {
        netSettleAmount = Number(netMatch[1].replace(/,/g, '')) || 0;
    } else {
        const grossMatch = cleanText.match(/(?:배정금액|세전\s*분배금액)\s*[:：]?\s*([\d,]+)\s*원/);
        if (grossMatch) {
            const gross = Number(grossMatch[1].replace(/,/g, '')) || 0;
            netSettleAmount = (totalTax > 0) ? (gross - totalTax) : gross;
        }
    }

    // 모달창 필드에 자동 주입
    const inputDate = document.getElementById('txDate');
    const selectAcc = document.getElementById('txAccount');
    const selectType = document.getElementById('txType');
    const selectStock = document.getElementById('txStock');
    const inputAmount = document.getElementById('txAmount');
    const inputTax = document.getElementById('txTax');
    const inputMemo = document.getElementById('txMemo');
    const modalTitle = document.getElementById('txModalTitle');

    if (inputDate) inputDate.value = detectedDate;
    if (selectAcc && detectedAccountId) selectAcc.value = detectedAccountId;
    if (selectType) selectType.value = '분배금';
    
    // 💡 종목이 정상 인식되었을 때만 선택하고, 없으면 빈값으로 두어 사용자가 선택하도록 유도 (현금 오매핑 원천 방어)
    if (selectStock) {
        if (detectedTicker) {
            selectStock.value = detectedTicker;
        }
    }
    
    if (inputAmount) inputAmount.value = netSettleAmount || '';
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
    setupOcrEngine();
    fetchD1Portfolio();
});