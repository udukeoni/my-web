// port/js/components/assetListTable.js

function renderDataTable(viewType, dataList) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const badge = document.getElementById('dataCountBadge');
    const title = document.getElementById('tableTitle');

    if (!thead || !tbody) return;

    if (viewType === 'HOLDINGS') {
        if (title) title.textContent = '보유 종목 상세';
        if (badge) badge.textContent = `${dataList ? dataList.length : 0}종목`;

        thead.innerHTML = `
            <tr>
              <th class="py-3.5 px-4">종목명 / 계좌</th>
              <th class="py-3.5 px-4 text-right">매수평균가</th>
              <th class="py-3.5 px-4 text-right">현재가</th>
              <th class="py-3.5 px-4 text-right">보유수량</th>
              <th class="py-3.5 px-4 text-right">평가금액 (비중)</th>
              <th class="py-3.5 px-4 text-right">평가손익</th>
              <th class="py-3.5 px-4 text-right">수익률</th>
            </tr>
        `;

        if (!dataList || dataList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">보유 종목이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = dataList.map(item => {
            const isPositive = item.profit_amount >= 0;
            const profitColor = isPositive ? 'text-red-500' : 'text-blue-500';
            const sign = isPositive ? '+' : '';

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900">${item.asset_name}</div>
                    <div class="text-xs text-slate-400">${item.ticker} · ${item.account_name} · ${item.sector || ''}</div>
                  </td>
                  <td class="py-3.5 px-4 text-right">₩${Number(item.avg_buy_price).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right font-medium">₩${Number(item.current_price).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-right">${Number(item.quantity).toLocaleString()}주</td>
                  <td class="py-3.5 px-4 text-right">
                    <div class="font-bold">₩${Number(item.eval_amount).toLocaleString()}</div>
                    <div class="text-xs text-slate-400">비중 ${item.weight}%</div>
                  </td>
                  <td class="py-3.5 px-4 text-right font-bold ${profitColor}">
                    ${sign}₩${Number(item.profit_amount).toLocaleString()}
                  </td>
                  <td class="py-3.5 px-4 text-right font-bold ${profitColor}">
                    ${sign}${item.profit_rate}%
                  </td>
                </tr>
            `;
        }).join('');

    } else {
        const titles = {
            ALL_LOGS: '전체 거래 내역',
            TRADE: '매수 / 매도 내역',
            DIVIDEND: '배당 및 분배금 내역',
            TRANSFER: '입금 / 출금 내역'
        };
        if (title) title.textContent = titles[viewType] || '원장 거래 내역';
        if (badge) badge.textContent = `${dataList ? dataList.length : 0}건`;

        thead.innerHTML = `
            <tr>
              <th class="py-3.5 px-4">거래일자</th>
              <th class="py-3.5 px-4">구분</th>
              <th class="py-3.5 px-4">계좌</th>
              <th class="py-3.5 px-4">종목코드 / 항목</th>
              <th class="py-3.5 px-4 text-right">수량</th>
              <th class="py-3.5 px-4 text-right">단가</th>
              <th class="py-3.5 px-4 text-right">정산금액</th>
              <th class="py-3.5 px-4">메모</th>
            </tr>
        `;

        if (!dataList || dataList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">기록된 거래 내역이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = dataList.map(item => {
            let badgeStyle = "bg-slate-100 text-slate-700";
            if (item.trade_type === '매수') badgeStyle = "bg-red-50 text-red-600";
            if (item.trade_type === '매도') badgeStyle = "bg-blue-50 text-blue-600";
            if (item.trade_type.includes('배당') || item.trade_type.includes('분배금')) badgeStyle = "bg-emerald-50 text-emerald-600";
            if (item.trade_type === '입금') badgeStyle = "bg-purple-50 text-purple-600";

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                  <td class="py-3.5 px-4 font-mono text-xs text-slate-600">${item.trade_date}</td>
                  <td class="py-3.5 px-4">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeStyle}">${item.trade_type}</span>
                  </td>
                  <td class="py-3.5 px-4 text-xs font-medium text-slate-700">${item.account_id}</td>
                  <td class="py-3.5 px-4 font-bold text-slate-800">${item.ticker || '-'}</td>
                  <td class="py-3.5 px-4 text-right">${item.quantity ? Number(item.quantity).toLocaleString() + '주' : '-'}</td>
                  <td class="py-3.5 px-4 text-right">${item.unit_price ? '₩' + Number(item.unit_price).toLocaleString() : '-'}</td>
                  <td class="py-3.5 px-4 text-right font-bold text-slate-900">₩${Number(item.settle_amount || 0).toLocaleString()}</td>
                  <td class="py-3.5 px-4 text-xs text-slate-400">${item.memo || ''}</td>
                </tr>
            `;
        }).join('');
    }
}