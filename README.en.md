# dexter-kabu-jp

Autonomous AI research agent for Japanese stocks.

> A fork of [virattt/dexter](https://github.com/virattt/dexter), purpose-built for Japanese equity analysis with local data sources and market-specific analytical frameworks.

For detailed documentation, see the [Japanese README](README.md).

## Key Features

- **11 analysis skills**: SEPA, Dow Theory, Granville's Laws, supply-demand analysis, volume profile (shikori), DCF valuation, multi-factor screening, and more
- **ISQ Signal Framework**: Quantifies investment signals across 5 dimensions (confidence, intensity, expectation gap, timeliness, direction)
- **Independent Evaluator**: AI-generated analysis is verified by a separate AI context across 4 quality axes (data sufficiency, consistency, insight, actionability)
- **4 data sources**: JQuants API v2 + EDINET DB + TradingView MCP + TDnet MCP
- **Persistent memory**: Remembers past analyses and tracks signal changes over time

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [JQuants API](https://jpx-jquants.com/) account (free tier available)
- At least one LLM API key (OpenAI / Anthropic / Google / Ollama)

### Install

```bash
git clone https://github.com/your-username/dexter-kabu-jp.git
cd dexter-kabu-jp
bun install
```

### Configure

```bash
cp env.example .env
# Edit .env — set JQUANTS_API_KEY, EDINETDB_API_KEY, and at least one LLM API key
```

### Run

```bash
bun start
```

## Data Sources

| Source | What it provides | Required |
|--------|-----------------|:--------:|
| **JQuants API v2** | Price, financials, margin balance, sector flows | Yes (free tier) |
| **EDINET DB** | Securities reports (XBRL) | Optional |
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

## JQuants Plan Comparison

| Feature | Free | Light | Standard | Premium |
|---------|:----:|:-----:|:--------:|:-------:|
| Daily price data | 12 weeks | 2 years | Full | Full |
| Financials | 2 years | 5 years | Full | Full |
| Margin balance | - | - | Full | Full |
| Institutional flows | - | - | Full | Full |
| Short-sell ratio | - | - | - | Full |

## License

MIT License. Originally forked from [virattt/dexter](https://github.com/virattt/dexter).

## Acknowledgements

- [virattt/dexter](https://github.com/virattt/dexter) — The base AI research agent
- [edinetdb/dexter-jp](https://github.com/edinetdb/dexter-jp) — Reference implementation for Japanese stocks
- [EDINET DB](https://edinetdb.jp/) — Securities report data
- [J-Quants](https://jpx-jquants.com/) — Official TSE market data
- [tdnet-disclosure-mcp](https://github.com/ajtgjmdjp/tdnet-disclosure-mcp) — Timely disclosure MCP server
