# dexter-kabu-jp

Japanese stock analysis AI kit for Claude Code.

> Built on [virattt/dexter](https://github.com/virattt/dexter) (18,000+ GitHub stars) and [edinetdb/dexter-jp](https://github.com/edinetdb/dexter-jp), with Claude Code integration, RadikabuNavi MCP, and 15 original analysis skills.

For detailed documentation, see the [Japanese README](README.md).

## Key Features

- **15 analysis skills**: SEPA, Dow Theory, Granville's Laws, supply-demand, DCF, Altman Z'' credit risk, Monte Carlo forecasting, correlation analysis, comprehensive analysis, and more
- **ISQ Signal Framework**: Quantifies investment signals across 5 dimensions (confidence, intensity, expectation gap, timeliness, direction)
- **Independent Evaluator**: AI-generated analysis is verified by a separate AI context across 4 quality axes (data sufficiency, consistency, insight, actionability)
- **4 data sources**: JQuants API v2 + RadikabuNavi MCP + TradingView MCP + TDnet MCP
- **Persistent memory**: Remembers past analyses and tracks signal changes over time

## Use with Claude Code (Recommended)

If you have Claude Code, this is the easiest way to get started. No LLM API key needed.

### Setup

```bash
git clone https://github.com/raditrejp/dexter-kabu-jp.git
cd dexter-kabu-jp
claude
```

On first launch, the AI will guide you through API key setup:
1. **JQuants API key** (free) — for stock price data
2. **RadikabuNavi API key** (free tier available) — for financial data

### Usage

```
> Analyze Toyota
→ Auto-runs DCF + Altman Z'' + SEPA + Dow Theory + Granville + supply-demand + Monte Carlo + correlation

> Find stocks with ROE >= 15% and dividend yield >= 3%
→ Screen ~3,800 companies

> Run DCF analysis on 7203
→ 3-scenario (conservative/base/optimistic) fair value calculation
```

## Standalone App (Terminal)

For using as a standalone chat app without Claude Code.

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [JQuants API](https://jpx-jquants.com/) account (free tier available)
- [RadikabuNavi MCP](https://radikabunavi.com/mcp-service) API key (recommended, free tier available) — EDINET-based financials and screener
- At least one LLM API key (OpenAI / Anthropic / Google / Ollama)

### Install

```bash
git clone https://github.com/raditrejp/dexter-kabu-jp.git
cd dexter-kabu-jp
bun install
```

### Configure

```bash
cp env.example .env
# Edit .env — set JQUANTS_API_KEY, RADIKABUNAVI_API_KEY, and at least one LLM API key
```

### Run

```bash
bun start
```

## Usage

After launching, you'll see a chat UI. Just talk to Dexter in Japanese (or English) — it automatically selects the right tools and skills.

```
> 7203の株価を見て                     → Fetches 60-day OHLCV data
> トヨタの財務を見て                   → Retrieves financials (revenue, profit, ROE)
> 7203をSEPA分析して                   → Runs Minervini's 7-criteria check
> 三菱UFJの需給を見て                  → Margin balance, short-sell ratio, investor flows
> 6758のDCFで理論株価を出して          → 3-scenario DCF valuation
> 半導体関連でスクリーニングして       → Multi-factor stock screening
> 7203を分析して                       → Auto-runs all skills: DCF + Altman Z'' + SEPA + Dow + Granville + supply-demand + Monte Carlo + correlation
> 7203の倒産リスクは？                 → Altman Z'' Score credit risk assessment
> トヨタの株価をモンテカルロで予測して → Probabilistic price forecast with VaR
> トヨタとTOPIXの相関は？              → Beta, correlation, regression analysis
> トヨタとホンダを比較して             → Peer comparison (PER, PBR, ROE)
> 7203の有報からリスク要因を読んで     → Extracts risk factors from securities reports
```

Dexter remembers past analyses. Analyzing the same stock again shows how signals have changed.

## Data Sources

| Source | What it provides | Required |
|--------|-----------------|:--------:|
| **JQuants API v2** | Price, financials, margin balance, sector flows | Yes (free tier) |
| **RadikabuNavi MCP** | EDINET-based financials, key ratios, screener | Recommended (free tier) |
| **TradingView MCP** | Technical indicators (RSI, MACD, BB, etc.) | Optional |
| **TDnet MCP** | Timely disclosure filings | Optional |

## Available Skills

| Skill | Description |
|-------|-------------|
| screening | Multi-factor screening (O'Neil x Minervini x Dow x Granville x supply-demand) |
| sepa | Minervini SEPA criteria check (7 items) and stage classification (S1-S4) |
| dow-theory | Trend determination using swing high/low patterns |
| granville | Buy/sell signals from Granville's 8 laws (price vs MA) |
| supply-demand | Margin balance, short-sell ratio, institutional flow analysis |
| shikori | Volume profile + margin data to identify trapped positions |
| dcf | Discounted cash flow valuation with 3 scenarios |
| dividend | Dividend yield trends, consecutive increases, DOE, payout ratio |
| peer-comparison | Sector comparison across PER, PBR, ROE, ROIC |
| earnings-calendar | Next earnings date, surprise history, volatility warnings |
| x-research | X/Twitter market sentiment research |
| altman-z | Altman Z'' Score credit risk analysis (safe/grey/distress zone) |
| monte-carlo | Monte Carlo simulation — probabilistic price distribution, VaR, target price probability |
| correlation | Cross-asset correlation, beta, regression statistics, idiosyncratic risk |
| comprehensive-analysis | Auto-orchestrates all skills for full-spectrum stock analysis with integrated ISQ scoring |

## License

MIT License. Originally forked from [virattt/dexter](https://github.com/virattt/dexter).

## Acknowledgements

- [virattt/dexter](https://github.com/virattt/dexter) — The base AI research agent (18,000+ GitHub stars)
- [edinetdb/dexter-jp](https://github.com/edinetdb/dexter-jp) — Japanese stock adaptation (EDINET DB API + J-Quants)
- [RadikabuNavi MCP](https://radikabunavi.com/mcp-service) — EDINET-based financials and screener
- [J-Quants](https://jpx-jquants.com/) — Official TSE market data
- [tdnet-disclosure-mcp](https://github.com/ajtgjmdjp/tdnet-disclosure-mcp) — Timely disclosure MCP server
