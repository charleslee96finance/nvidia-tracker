# 全自動量化交易系統 (MU)

```
data.py ──► strategies.py ──► engine.py ──► broker.py
(數據層)      (4策略訊號)      (風控+決策)     (紙上/Alpaca下單)
                 │                │
            backtest.py        risk.py
            (歷史回測)      (波動率倉位/熔斷/停損)
```

## 快速開始

```bash
cd quant_trading

# 1. 歷史回測：四策略 vs Buy&Hold 完整績效報告 + 圖表
python3 run.py

# 2. 自動交易（紙上模擬，預設 $100,000 起始資金）
python3 engine.py --once            # 跑一次決策並下單
python3 engine.py --once --dry-run  # 只看決策不下單
```

## 全自動排程（每個交易日收盤後執行）

```bash
# crontab -e （美東 16:30 收盤後）
30 16 * * 1-5  cd /path/to/nvidia-tracker/quant_trading && python3 engine.py --once >> cron.log 2>&1
```

## 接真實券商（Alpaca 紙上交易 → 實盤）

1. 到 [alpaca.markets](https://alpaca.markets) 申請免費 Paper Trading 金鑰
2. 設定環境變數後以 `--broker alpaca` 執行：

```bash
export ALPACA_API_KEY=xxx
export ALPACA_SECRET_KEY=xxx
# 實盤改 export ALPACA_BASE_URL=https://api.alpaca.markets （務必先紙上驗證數月）
python3 engine.py --once --broker alpaca
```

## 決策邏輯

1. **數據**：yfinance → stooq → 模擬 fallback（本環境網路受限時自動降級，數據來源會印在決策卡上）
2. **訊號**：4 策略投票（趨勢 EMA20/50 權重 35%、動量+RSI 25%、唐奇安突破 25%、布林均值回歸 15%），加權票數 ≥ 0.5 才持倉
3. **風控**：
   - 波動率目標 35%：行情越瘋自動降倉
   - 帳戶回撤 25% 熔斷：強制空手直到手動重置
   - 不開槓桿、不做空、現金不足自動縮量
4. **執行**：目標股數 − 現有持倉 = 下單量；所有交易與權益記錄存 `state/portfolio.json`

## 回測結果（模擬數據示範，2021–2026）

| 策略 | 總報酬 | 年化 | 夏普 | 最大回撤 | 勝率 |
|---|---|---|---|---|---|
| 趨勢均線交叉 | 767% | 46.7% | 1.47 | -41.4% | 30.8% |
| 突破(唐奇安) | 369% | 31.5% | 1.31 | -36.4% | 46.2% |
| 均值回歸 | 104% | 13.4% | 0.88 | **-16.5%** | 78.3% |
| 動量+RSI | 74% | 10.3% | 0.51 | -47.2% | 36.6% |
| Buy & Hold | 1,089% | 55.1% | 1.39 | -40.8% | — |

> ⚠️ **風險聲明**：本系統供學習研究。模擬數據結果不代表真實績效；真實數據回測亦不保證未來報酬。
> 實盤前務必：用真實數據重新回測 → 紙上交易驗證至少 1–3 個月 → 小資金試運行。
> 量化策略在記憶體股這種高波動標的上可能大幅虧損，請自行承擔風險。
