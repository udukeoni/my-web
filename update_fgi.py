import json
import math
from datetime import datetime, timezone, timedelta
import requests
import yfinance as yf

KST = timezone(timedelta(hours=9))

def get_crypto_fgi():
    try:
        res = requests.get('https://api.alternative.me/fng/?limit=1', timeout=10)
        return int(res.json()['data'][0]['value'])
    except Exception as e:
        print(f"Crypto FGI Error: {e}")
        return None

def get_us_fgi():
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        res = requests.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', headers=headers, timeout=10)
        return round(res.json()['fear_and_greed']['score'])
    except Exception as e:
        print(f"US FGI Error: {e}")
        return None

def clamp01(x):
    return min(1.0, max(0.0, x))

def get_status_label(score):
    if score <= 24: return '극단적 공포'
    if score <= 44: return '공포'
    if score <= 55: return '중립'
    if score <= 75: return '탐욕'
    return '극단적 탐욕'

def calculate_detailed_kospi():
    try:
        # 1. 코스피 지수 데이터
        ks = yf.Ticker('^KS11').history(period='1y')
        closes = ks['Close'].dropna().tolist()
        volumes = ks['Volume'].dropna().tolist()
        last_close = closes[-1]

        # 2. 환율 (USDKRW=X)
        usdkrw = yf.Ticker('USDKRW=X').history(period='1y')['Close'].dropna().tolist()
        last_fx = usdkrw[-1]
        fx_sma50 = sum(usdkrw[-50:]) / 50
        # 환율이 50일선보다 낮을수록 원화 강세(탐욕), 높을수록 공포
        fx_score = clamp01((1.05 - (last_fx / fx_sma50)) / 0.10) * 100

        # 3. 시장 모멘텀 (125일 이평)
        sma125 = sum(closes[-125:]) / 125
        momentum_score = clamp01(((last_close / sma125 - 1) + 0.08) / 0.16) * 100

        # 4. 주가 강도 (52주 고저 범위 위치)
        yr_closes = closes[-252:]
        hi, lo = max(yr_closes), min(yr_closes)
        strength_score = 50.0 if hi == lo else ((last_close - lo) / (hi - lo)) * 100

        # 5. 주가 폭 (볼륨 기반 맥클렐런 근사 지수)
        # 가격 상승일과 하락일의 거래량 차이 추세
        vol_breadth = []
        for i in range(1, len(closes)):
            vol_breadth.append(volumes[i] if closes[i] >= closes[i-1] else -volumes[i])
        vol_ema19 = sum(vol_breadth[-19:]) / 19
        vol_ema39 = sum(vol_breadth[-39:]) / 39
        mcclellan_osc = vol_ema19 - vol_ema39
        breadth_score = clamp01((mcclellan_osc / (sum(volumes[-19:]) / 19 + 1e-5) + 0.5)) * 100

        # 6. 시장 변동성 (최근 20일 실현 변동성 vs 100일)
        returns = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
        ret20 = returns[-20:]
        ret100 = returns[-100:]
        std20 = math.sqrt(sum((r - (sum(ret20)/20))**2 for r in ret20) / 20)
        std100 = math.sqrt(sum((r - (sum(ret100)/100))**2 for r in ret100) / 100)
        vol_ratio = std20 / (std100 + 1e-6)
        volatility_score = clamp01((1.4 - vol_ratio) / 0.8) * 100

        # 7. 단기 과열 및 파생 심리 (RSI 및 모멘텀 기반 합성 풋/콜 지수 대용)
        diffs = [closes[i] - closes[i - 1] for i in range(-14, 0)]
        gains = [d for d in diffs if d > 0]
        losses = [-d for d in diffs if d < 0]
        avg_g = sum(gains) / 14 if gains else 0
        avg_l = sum(losses) / 14 if losses else 0
        rsi = 100.0 if avg_l == 0 else (100.0 - (100.0 / (1.0 + (avg_g / avg_l))))
        put_call_score = rsi  # 과열 심리 반영

        # 8. 안전자산 수요 (최근 20일 KOSPI 수익률 vs 방어적 채권 성향)
        ret20_cum = (closes[-1] / closes[-21] - 1) * 100 if len(closes) > 21 else 0
        safe_haven_score = clamp01((ret20_cum + 5.0) / 10.0) * 100

        # 9. 신용 스프레드 / 정크본드 대용
        credit_score = clamp01(0.5 + (closes[-1] / closes[-5] - 1) * 5) * 100

        # 가중 평균 (8개 팩터)
        factors = [
            {"name": "환율(원/달러)", "score": round(fx_score), "desc": f"현재 {last_fx:.1f}원 (50일 평균 {fx_sma50:.1f}원 대비 추세)", "weight": 0.15},
            {"name": "시장 모멘텀", "score": round(momentum_score), "desc": f"KOSPI 종가 {last_close:.2f}p vs 125일선 {sma125:.2f}p", "weight": 0.15},
            {"name": "주가 상승(강도)", "score": round(strength_score), "desc": f"52주 고저 범위 내 {strength_score:.1f}% 구간 위치", "weight": 0.12},
            {"name": "주가 폭(브레드스)", "score": round(breadth_score), "desc": "거래량 수급 추세 및 누적 참여 강도", "weight": 0.13},
            {"name": "풋/콜 옵션(심리)", "score": round(put_call_score), "desc": f"단기 매수/매도 파생 심리 (RSI {rsi:.1f})", "weight": 0.10},
            {"name": "시장 변동성", "score": round(volatility_score), "desc": f"최근 20일 변동성 비율: {vol_ratio:.2f}배", "weight": 0.15},
            {"name": "안전자산 수요", "score": round(safe_haven_score), "desc": f"최근 20일 지수 등락폭: {ret20_cum:+.1f}%", "weight": 0.10},
            {"name": "정크본드/신용위험", "score": round(credit_score), "desc": "신용위험 선호 및 단기 유동성 흐름", "weight": 0.10}
        ]

        total_score = round(sum(f['score'] * f['weight'] for f in factors), 1)

        # AI 요약 생성
        status = get_status_label(total_score)
        summary_text = f"공포탐욕지수 {total_score}점은 {status} 구간입니다. KOSPI 종가가 125일 평균선 대비 {'위' if last_close >= sma125 else '아래'}에 위치하며, 변동성과 환율 흐름이 복합 반영되었습니다."
        
        reasons = [
            f"KOSPI 종가는 {last_close:,.2f}p로 125일 이동평균선({sma125:,.2f}p) 대비 {'상회하여 긍정적' if last_close >= sma125 else '하회하여 약세 압력'} 신호입니다.",
            f"원/달러 환율은 {last_fx:,.1f}원으로 대외 안전자산 선호 심리가 {'완화' if fx_score >= 50 else '지속'}되고 있습니다.",
            f"단기 변동성 배율은 {vol_ratio:.2f}배로 변동성 지표는 {get_status_label(volatility_score)} 구간을 나타냅니다."
        ]

        return {
            "score": total_score,
            "status": status,
            "summary": summary_text,
            "reasons": reasons,
            "factors": [{**f, "label": get_status_label(f['score'])} for f in factors]
        }
    except Exception as e:
        print(f"KOSPI Error: {e}")
        return None

def main():
    kr_data = calculate_detailed_kospi()
    us_score = get_us_fgi()
    crypto_score = get_crypto_fgi()

    now = datetime.now(KST)
    data = {
        "updated_at": now.strftime("%Y. %m. %d. %H:%M"),
        "kr": kr_data["score"] if kr_data else 50,
        "kr_data": kr_data,
        "us": us_score,
        "crypto": crypto_score
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("data.json updated successfully.")

if __name__ == '__main__':
    main()