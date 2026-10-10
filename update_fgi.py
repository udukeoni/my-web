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
        # 1. 코스피 지수 (^KS11)
        ks = yf.Ticker('^KS11').history(period='1y')
        closes = [float(x) for x in ks['Close'].dropna().tolist()]
        volumes = [float(x) for x in ks['Volume'].dropna().tolist()] if 'Volume' in ks else []

        if len(closes) < 60:
            raise ValueError("KOSPI data points are insufficient")

        last_close = closes[-1]
        sma_len = min(125, len(closes))
        sma125 = sum(closes[-sma_len:]) / sma_len

        # 2. 환율
        try:
            usdkrw = yf.Ticker('USDKRW=X').history(period='3mo')['Close'].dropna().tolist()
            last_fx = float(usdkrw[-1])
            fx_sma = sum(usdkrw[-min(50, len(usdkrw)):]) / min(50, len(usdkrw))
            fx_score = clamp01((1.05 - (last_fx / fx_sma)) / 0.10) * 100
        except Exception:
            last_fx, fx_sma = 1350.0, 1350.0
            fx_score = 50.0

        # 3. 시장 모멘텀
        momentum_score = clamp01(((last_close / sma125 - 1) + 0.08) / 0.16) * 100

        # 4. 주가 강도 (52주 범위)
        yr_closes = closes[-min(252, len(closes)):]
        hi, lo = max(yr_closes), min(yr_closes)
        strength_score = 50.0 if hi == lo else ((last_close - lo) / (hi - lo)) * 100

        # 5. 주가 폭 (거래량 가중치)
        if len(volumes) >= 40 and len(volumes) == len(closes):
            vol_breadth = [volumes[i] if closes[i] >= closes[i-1] else -volumes[i] for i in range(1, len(closes))]
            vol_ema19 = sum(vol_breadth[-19:]) / 19
            vol_ema39 = sum(vol_breadth[-39:]) / 39
            mcclellan = vol_ema19 - vol_ema39
            avg_vol = (sum(volumes[-19:]) / 19) + 1e-5
            breadth_score = clamp01((mcclellan / avg_vol + 0.5)) * 100
        else:
            breadth_score = strength_score

        # 6. 시장 변동성
        returns = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
        ret20 = returns[-min(20, len(returns)):]
        std20 = math.sqrt(sum((r - (sum(ret20)/len(ret20)))**2 for r in ret20) / len(ret20)) if len(ret20) > 1 else 0.01
        std_all = math.sqrt(sum((r - (sum(returns)/len(returns)))**2 for r in returns) / len(returns)) if len(returns) > 1 else 0.01
        vol_ratio = std20 / (std_all + 1e-6)
        volatility_score = clamp01((1.4 - vol_ratio) / 0.8) * 100

        # 7. 단기 과열 (RSI)
        diffs = [closes[i] - closes[i - 1] for i in range(-min(14, len(closes)-1), 0)]
        gains = [d for d in diffs if d > 0]
        losses = [-d for d in diffs if d < 0]
        avg_g = sum(gains) / 14 if gains else 0
        avg_l = sum(losses) / 14 if losses else 0
        rsi = 100.0 if avg_l == 0 else (100.0 - (100.0 / (1.0 + (avg_g / avg_l))))
        put_call_score = rsi

        # 8. 안전자산 수요 & 신용위험
        ret20_cum = (closes[-1] / closes[-min(21, len(closes))] - 1) * 100
        safe_haven_score = clamp01((ret20_cum + 5.0) / 10.0) * 100
        credit_score = clamp01(0.5 + (closes[-1] / closes[-min(6, len(closes))] - 1) * 5) * 100

        factors = [
            {"name": "환율(원/달러)", "score": round(fx_score), "desc": f"현재 {last_fx:.1f}원 (추세 반영)", "weight": 0.15},
            {"name": "시장 모멘텀", "score": round(momentum_score), "desc": f"종가 {last_close:,.1f}p vs 이동평균선", "weight": 0.15},
            {"name": "주가 상승(강도)", "score": round(strength_score), "desc": f"52주 밴드 내 {strength_score:.0f}% 위치", "weight": 0.12},
            {"name": "주가 폭(브레드스)", "score": round(breadth_score), "desc": "거래대금/거래량 수급 지표", "weight": 0.13},
            {"name": "풋/콜 옵션(심리)", "score": round(put_call_score), "desc": f"단기 매수/매도 심리 (RSI {rsi:.0f})", "weight": 0.10},
            {"name": "시장 변동성", "score": round(volatility_score), "desc": f"변동성 비율 {vol_ratio:.2f}배", "weight": 0.15},
            {"name": "안전자산 수요", "score": round(safe_haven_score), "desc": f"최근 20일 등락률: {ret20_cum:+.1f}%", "weight": 0.10},
            {"name": "정크본드/신용위험", "score": round(credit_score), "desc": "신용위험 선호 지표", "weight": 0.10}
        ]

        total_score = round(sum(f['score'] * f['weight'] for f in factors), 1)
        status = get_status_label(total_score)
        summary_text = f"공포탐욕지수 {total_score}점은 {status} 구간입니다. KOSPI 종가가 125일 평균선 대비 {'위' if last_close >= sma125 else '아래'}에 위치하며, 변동성과 환율 흐름이 종합 반영되었습니다."

        reasons = [
            f"KOSPI 종가는 {last_close:,.2f}p로 125일선 대비 {'상회하여 긍정적' if last_close >= sma125 else '하회하여 약세 압력'} 신호입니다.",
            f"원/달러 환율은 {last_fx:,.1f}원으로 위험선호 흐름이 {'안정적' if fx_score >= 50 else '둔화'} 상태입니다.",
            f"단기 변동성 지표는 {get_status_label(volatility_score)} 구간을 가리키고 있습니다."
        ]

        return {
            "score": total_score,
            "status": status,
            "summary": summary_text,
            "reasons": reasons,
            "factors": [{**f, "label": get_status_label(f['score'])} for f in factors]
        }
    except Exception as e:
        print(f"KOSPI Calculation Error: {e}")
        return {
            "score": 50.0,
            "status": "중립",
            "summary": "지표 데이터 수신 지연으로 기본 중립 수치가 적용되었습니다.",
            "reasons": ["데이터 수집 서버 일시적 지연"],
            "factors": []
        }

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