// port/js/app.js

let currentAccount = 'ALL';
let currentView = 'HOLDINGS'; // 기본: 종목 잔고

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

        // 3. 메인 테이블 렌더링 (종목 잔고 또는 거래내역)
        if (typeof renderDataTable === 'function') {
            const listToRender = currentView === 'HOLDINGS' ? data.holdings : data.logs;
            renderDataTable(currentView, listToRender);
        }

    } catch (err) {
        console.error("D1 API 호출 에러:", err);
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
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
                b.className = 'tab-btn px-3 py-1.5 rounded-lg transition text-slate-500 hover:text-slate-800';
            });
            btn.className = 'tab-btn px-3 py-1.5 rounded-lg transition bg-white shadow-sm text-blue-600 font-bold';

            currentView = btn.getAttribute('data-view');
            fetchD1Portfolio();
        });
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
    fetchD1Portfolio();
});