// port/js/app.js

/**
 * [전역 상태 (Global State)]
 * 화면의 모든 조각(컴포넌트)이 참조할 핵심 데이터 바구니.
 */
let appState = {
    currentAccountId: 'ALL',  // 선택된 계좌 아이디
    portfolioData: null       // DB에서 받아올 자산 정보
};

/**
 * [초기화 함수] portfolio.html이 열리면 가장 먼저 실행됨.
 */
async function initApp() {
    console.log("포트폴리오 앱 초기화 시작...");
    // 1. 초기 데이터 불러오기
    await loadPortfolioData(appState.currentAccountId);
    
    // 2. 이벤트 리스너(버튼 동작) 연결
    bindEvents();
}

/**
 * [데이터 패칭] 선택된 계좌의 자산 데이터를 가져옴.
 */
async function loadPortfolioData(accountId) {
    try {
        // [초급자 팁] 실서버 API가 없으므로 화면을 그리기 위한 가짜(더미) 데이터를 만듦
        const dummyData = {
            netWorth: 95887075,
            dailyProfit: -2686803,
            dividend: 6537339
        };
        
        // 전역 상태 업데이트
        appState.portfolioData = dummyData;
        
        // 데이터가 갱신되었으니 화면을 다시 그리라고 명령
        renderAllComponents();
    } catch (e) {
        console.error("데이터 로드 실패", e);
    }
}

/**
 * [렌더링 지휘] 화면의 조각(컴포넌트)들을 업데이트하는 함수들을 일괄 실행.
 */
function renderAllComponents() {
    if(typeof renderSummaryCard === 'function') {
        renderSummaryCard(appState.portfolioData);
    }
}

// 브라우저가 HTML 렌더링을 마치면 initApp 실행
document.addEventListener('DOMContentLoaded', initApp);