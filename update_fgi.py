import json
import re
from datetime import datetime, timezone, timedelta
import requests
from bs4 import BeautifulSoup

KST = timezone(timedelta(hours=9))

def get_crypto_fgi():
    try:
        res = requests.get('https://api.alternative.me/fng/?limit=1', timeout=10)
        return int(res.json()['data'][0]['value'])
    except Exception as e:
        print(f"Crypto FGI Error: {e}")
        return 50

def get_us_fgi():
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://edition.cnn.com/',
            'Accept': 'application/json, text/plain, */*'
        }
        res = requests.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', headers=headers, timeout=10)
        res.raise_for_status()
        data = res.json()
        return round(data['fear_and_greed']['score'])
    except Exception as e:
        print(f"US FGI Error: {e}")
        return 50

def get_kospi_fgi():
    fallback_data = {
        "score": 50.0,
        "status": "중립",
        "summary": "데이터 수집 서버 일시적 지연으로 기본 수치가 적용되었습니다.",
        "reasons": ["kospifgi.com 연결 실패 또는 파싱 오류"],
        "factors": []
    }
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        url = 'https://www.kospifgi.com/'
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # 전체 텍스트 추출
        page_text = soup.get_text(separator=' ', strip=True)
        
        # 1. 지수(Score)와 상태(Status) 파싱
        # "KOSPI Fear & Greed Index 46.8 중립" 형태의 패턴 매칭
        score_match = re.search(r'Index\s+(\d+\.?\d*)\s*(극단적 공포|공포|중립|탐욕|극단적 탐욕)', page_text)
        if score_match:
            score = float(score_match.group(1))
            status = score_match.group(2)
        else:
            # 보조 패턴: "공포탐욕지수 46.8은 중립..."
            score_match = re.search(r'공포탐욕지수\s+(\d+\.?\d*)\s*은\s*([^\s]+)', page_text)
            score = float(score_match.group(1)) if score_match else 50.0
            status = score_match.group(2) if score_match else "중립"

        # 2. 요약(Summary) 추출
        summary = ""
        summary_match = re.search(r'AI 분석 및 요약.*?기준일.*?(공포탐욕지수.*?)(?=왜 이렇게 나왔나요|###)', page_text)
        if summary_match:
            summary = summary_match.group(1).strip()
        else:
            summary = f"현재 코스피 공포탐욕지수는 {score}점으로 {status} 구간입니다."

        # 3. 이유(Reasons) 추출
        reasons = []
        reason_section = re.search(r'왜 이렇게 나왔나요\? (.*?)(?=주의할 점|###|\*\*)', page_text)
        if reason_section:
            # 리스트 기호(*) 등으로 구분된 문장들 추출
            reasons = [r.strip() for r in re.split(r'\s*\*\s*', reason_section.group(1)) if len(r.strip()) > 5]
        
        if not reasons:
            reasons = ["상세 분석 데이터를 가져올 수 없습니다."]

        # 4. 세부 지표(Factors) 추출
        factors = []
        factor_names = ["환율(원/달러)", "시장 모멘텀", "주가 상승(강도)", "주가 폭(브레드스)", "풋/콜 옵션", "시장 변동성", "안전자산 수요", "정크본드 수요"]
        
        for name in factor_names:
            # 각 지표명 뒤에 오는 상태값(공포, 탐욕 등) 찾기
            pattern = re.escape(name) + r'\s+(극단적 공포|공포|중립|탐욕|극단적 탐욕)'
            match = re.search(pattern, page_text)
            if match:
                f_status = match.group(1)
                # 점수 매핑 (사이트 기준 역산 또는 대표값)
                status_to_score = {"극단적 공포": 12, "공포": 35, "중립": 50, "탐욕": 65, "극단적 탐욕": 88}
                factors.append({
                    "name": name,
                    "score": status_to_score.get(f_status, 50),
                    "label": f_status,
                    "desc": f"{name} 지표가 {f_status} 상태입니다."
                })

        return {
            "score": score,
            "status": status,
            "summary": summary,
            "reasons": reasons,
            "factors": factors
        }
        
    except Exception as e:
        print(f"KOSPI Scraper Error: {e}")
        return fallback_data

def main():
    kr_data = get_kospi_fgi()
    us_score = get_us_fgi()
    crypto_score = get_crypto_fgi()

    now = datetime.now(KST)
    data = {
        "updated_at": now.strftime("%Y. %m. %d. %H:%M"),
        "kr": kr_data["score"],
        "kr_data": kr_data,
        "us": us_score,
        "crypto": crypto_score
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"data.json updated successfully at {data['updated_at']}.")

if __name__ == '__main__':
    main()