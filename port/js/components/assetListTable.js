// port/js/components/assetListTable.js

function renderAssetListTable(holdings) {
    const tbody = document.getElementById('assetTableBody');
    const badge = document.getElementById('holdingCountBadge');
    
    if (badge) badge.textContent = `${holdings.length}종목`;
    if (!tbody) return;

    if (!holdings || holdings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">보유 종목이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = holdings.map(item => {
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
}