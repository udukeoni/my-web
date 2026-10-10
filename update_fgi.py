import json
import math
import os
from datetime import datetime, timezone, timedelta
import requests
import yfinance as yf

KST = timezone(timedelta(hours=9))

def get_crypto_fgi():
    try:
        res = requests.get('https://api.alternative.me/fng/?limit=1', timeout=10)
        data = res.json()
        return int(data['data'][0]['value'])
    except Exception as e:
        print(f"Crypto FGI Error: {e}")
        return None

def get_us_fgi():
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        res = requests.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', headers=headers, timeout=10)
        data = res.json()
        return round(data['fear_and_greed']['score'])
    except Exception as e:
        print(f"US FGI Error: {e}")
        return None

def calculate_kospi_fgi():
    try:
        # 코스피 지수 (^KS11) 최근 1년 데이터
        ticker = yf.Ticker('^KS11')
        df = ticker.history(period='1y')
        closes = df['Close'].dropna().tolist()

        if len(closes) < 126:
            return None, ""

        last = closes[-1]

        # 1. 모멘텀: 125일 이평 대비 괴리율 (±10% -> 0~100)
        sma125 = sum(closes[-125:]) / 125
        momentum = min(1.0, max(0.0, ((last / sma125 - 1) + 0.10) / 0.20)) * 100

        # 2. 주가 강도: 52주 고저 범위 위치
        yr_closes = closes[-252:]
        hi, lo = max(yr_closes), min(yr_closes)
        strength = 50.0 if hi == lo else ((last - lo) / (hi - lo)) * 100

        # 3. RSI(14)
        recent_diffs = [closes[i] - closes[i - 1] for i in range(-14, 0)]
        gains = [d for d in recent_diffs if d > 0]
        losses = [-d for d in recent_diffs if d < 0]
        avg_gain = sum(gains) / 14 if gains else 0
        avg_loss = sum(losses) / 14 if losses else 0
        rsi = 100.0 if avg_loss == 0 else (100.0 - (100.0 / (1.0 + (avg_gain / avg_loss))))

        # 4. 변동성 (최근 20일 vs 100일)
        returns = [math.log(closes[i] / closes[i - 1]) for i in range(-100, 0)]
        mean_ret = sum(returns) / len(returns)
        stdev_all = math.sqrt(sum((r - mean_ret) ** 2 for r in returns) / len(returns))
        
        ret20 = returns[-20:]
        mean_ret20 = sum(ret20) / len(ret20)
        stdev20 = math.sqrt(sum((r - mean_ret20) ** 2 for r in ret20) / len(ret20))

        vol_ratio = stdev20 / stdev_all if stdev_all != 0 else 1.0
        volatility = min(1.0, max(0.0, (1.5 - vol_ratio) / 1.0)) * 100

        score = round(momentum * 0.3 + strength * 0.25 + rsi * 0.2 + volatility * 0.25)
        detail = f"모멘텀 {round(momentum)} · 강도 {round(strength)} · RSI {round(rsi)} · 변동성 {round(volatility)}"
        return score, detail
    except Exception as e:
        print(f"KOSPI FGI Error: {e}")
        return None, ""

def main():
    kr_score, kr_detail = calculate_kospi_fgi()
    us_score = get_us_fgi()
    crypto_score = get_crypto_fgi()

    now = datetime.now(KST)
    data = {
        "updated_at": now.strftime("%Y. %m. %d. %H:%M"),
        "kr": kr_score,
        "kr_detail": kr_detail,
        "us": us_score,
        "crypto": crypto_score
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("data.json updated successfully.")

if __name__ == '__main__':
    main()