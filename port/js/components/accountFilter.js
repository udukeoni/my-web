// port/js/components/accountFilter.js

/**
 * [이벤트 바인딩] 화면의 드롭다운 조작을 감지함.
 */
function bindEvents() {
    const accountSelect = document.getElementById('selectAccount');
    
    // select 박스의 값이 'change' 될 때마다 실행
    accountSelect.addEventListener('change', function(e) {
        const selectedId = e.target.value; 
        
        // 1. 상태값 갱신
        appState.currentAccountId = selectedId;
        
        // 2. 바뀐 계좌로 데이터 다시 불러오기
        loadPortfolioData(selectedId);
    });
}