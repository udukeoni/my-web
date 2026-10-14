// port/js/app.js

let currentAccount = 'ALL';
let currentView = 'HOLDINGS';

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

        // 1. 계좌 선택 드롭다운 채우기
        populateAccountOptions(data.accounts);

        // 2. 상단 요약 카드 렌더링
        if (typeof renderSummaryCard === 'function') {
            renderSummaryCard(data.summary);
        }

        // 3. 종목 데이터에 최신 일간 등락률 매핑
        const dailyRatesMap = getStoredDailyRates();
        const holdingsWithDaily = (data.holdings || []).map(h => ({
            ...h,
            daily_change_rate: dailyRatesMap[h.ticker] !== undefined ? dailyRatesMap[h.ticker] : (h.daily_change_rate || 0)
        }));

        // 4. 자산 비중 트리맵 차트 렌더링
        if (typeof renderTreemapChart === 'function') {
            renderTreemapChart(holdingsWithDaily);
        }

        // 5. 메인 테이블 및 모바일 카드 뷰 렌더링
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
        opt.textContent = `${acc.account_name} (${acc.account_type})`;
        select.appendChild(opt);
    });
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

// 현재가 동기화 시 일간 등락률 캐시 저장
function setupSyncPriceButton() {
    const btn = document.getElementById('btnSyncPrices');
    const icon = document.getElementById('syncIcon');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        if (icon) icon.classList.add('fa-spin');

        try {
            const res = await fetch('/api/sync-prices', { method: 'POST' });
            const result = await res.json();

            if (result.success) {
                // 네이버 증권의 일간 등락률 데이터를 로컬에 즉시 저장
                if (result.dailyRates) {
                    localStorage.setItem('DAILY_RATES_CACHE', JSON.stringify(result.dailyRates));
                }
                alert(`총 ${result.updatedCount}개 종목의 현재가와 일간 등락률이 최신 시세로 업데이트되었습니다.`);
                await fetchD1Portfolio();
            } else {
                alert(`동기화 실패: ${result.error}`);
            }
        } catch (err) {
            alert(`동기화 중 오류 발생: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            if (icon) icon.classList.remove('fa-spin');
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
    fetchD1Portfolio();
});