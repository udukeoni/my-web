// port/js/app.js

let currentAccount = 'ALL';

async function fetchD1Portfolio(accountId = 'ALL') {
    try {
        const res = await fetch(`/api/portfolio?account=${accountId}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // 1. 계좌 선택 드롭다운 채우기 (최초 1회)
        populateAccountOptions(data.accounts);

        // 2. 상단 요약 카드 렌더링
        if (typeof renderSummaryCard === 'function') {
            renderSummaryCard(data.summary);
        }

        // 3. 종목 리스트 테이블 렌더링
        if (typeof renderAssetListTable === 'function') {
            renderAssetListTable(data.holdings);
        }

    } catch (err) {
        console.error("D1 API 연동 실패:", err);
        const tbody = document.getElementById('assetTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-500">DB 연동 오류: ${err.message}</td></tr>`;
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

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('selectAccount');
    if (select) {
        select.addEventListener('change', (e) => {
            currentAccount = e.target.value;
            fetchD1Portfolio(currentAccount);
        });
    }

    // 초기 데이터 로드 (전체 계좌)
    fetchD1Portfolio('ALL');
});