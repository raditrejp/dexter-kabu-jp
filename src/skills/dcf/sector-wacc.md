# Sector WACC Adjustments (Japanese Market)

Use these typical WACC ranges as starting points for Japanese equities, then adjust based on company-specific factors. Japanese WACC is generally lower than US due to low JGB yields and cost of debt.

## Determining Company Sector

Use `get_financials` with query `"[TICKER] company facts"` to retrieve the company's `sector`. Match the returned sector to the TSE 33-sector classification below.

## Base Assumptions

- **Risk-free rate**: ~1.0-1.5% (JGB 10-year yield)
- **Equity risk premium**: ~5-6%
- **Cost of debt**: ~0.5-2.0% pre-tax (Japanese low-rate environment)
- **Tax rate**: ~30% (Japanese corporate tax)
- **Representative WACC range**: 4-8% for most Japanese sectors

## WACC by TSE Sector (33 Sectors)

| # | TSE Sector | Typical WACC Range | Notes |
|---|-----------|-------------------|-------|
| 1 | Water Products / Agriculture & Forestry (水産・農林業) | 5-6% | Stable demand, moderate cyclicality |
| 2 | Mining (鉱業) | 6-8% | Commodity exposure, capital intensive |
| 3 | Construction (建設業) | 5-6% | Government spending dependent, stable backlog |
| 4 | Foods (食料品) | 4-5% | Defensive, stable cash flows |
| 5 | Textiles & Apparel (繊維製品) | 5-7% | Cyclical, competitive pressure |
| 6 | Pulp & Paper (パルプ・紙) | 5-6% | Commodity exposure, capital intensive |
| 7 | Chemicals (化学) | 5-7% | Wide range: specialty (lower) to commodity (higher) |
| 8 | Pharmaceutical (医薬品) | 5-7% | Pipeline risk offset by stable demand |
| 9 | Oil & Coal Products (石油・石炭製品) | 6-8% | Commodity price exposure |
| 10 | Rubber Products (ゴム製品) | 5-7% | Auto sector dependency, cyclical |
| 11 | Glass & Ceramics (ガラス・土石製品) | 5-6% | Moderate cyclicality |
| 12 | Iron & Steel (鉄鋼) | 6-8% | Highly cyclical, capital intensive |
| 13 | Nonferrous Metals (非鉄金属) | 6-8% | Commodity exposure, cyclical |
| 14 | Metal Products (金属製品) | 5-6% | Moderate cyclicality |
| 15 | Machinery (機械) | 5-7% | Cyclical, export sensitive |
| 16 | Electric Appliances (電気機器) | 5-7% | Wide range: semicon (higher) to mature electronics (lower) |
| 17 | Transportation Equipment (輸送用機器) | 5-7% | Auto OEMs lower, parts makers higher |
| 18 | Precision Instruments (精密機器) | 5-7% | Technology and medical exposure |
| 19 | Other Products (その他製品) | 5-6% | Mixed; gaming, furniture, etc. |
| 20 | Electric Power & Gas (電気・ガス業) | 4-5% | Regulated, stable cash flows |
| 21 | Land Transportation (陸運業) | 4-6% | Rail: stable; trucking: cyclical |
| 22 | Marine Transportation (海運業) | 6-8% | Highly cyclical, global trade exposure |
| 23 | Air Transportation (空運業) | 5-7% | Cyclical, fuel cost exposure |
| 24 | Warehousing & Harbor Transport (倉庫・運輸関連業) | 5-6% | Stable logistics demand |
| 25 | Information & Communication (情報・通信業) | 5-8% | Telecom (lower) vs IT growth (higher) |
| 26 | Wholesale Trade (卸売業) | 5-6% | Sogo shosha: diversified, lower risk |
| 27 | Retail Trade (小売業) | 5-6% | Consumer staples lower, discretionary higher |
| 28 | Banks (銀行業) | 4-6% | Leverage in business model, rate sensitive |
| 29 | Securities & Commodity Futures (証券・商品先物取引業) | 6-8% | Market cycle dependency |
| 30 | Insurance (保険業) | 5-6% | Stable premiums, investment portfolio risk |
| 31 | Other Financing (その他金融業) | 5-7% | Leasing, consumer finance, credit |
| 32 | Real Estate (不動産業) | 4-6% | Interest rate sensitivity, stable rental income |
| 33 | Services (サービス業) | 5-7% | Wide range: staffing, consulting, entertainment |

## Adjustment Factors

Add to base WACC:
- **High debt (D/E > 1.5)**: +1-2%
- **Small cap (< 500億円 market cap)**: +1-2%
- **Emerging markets exposure (non-Japan revenue)**: +0.5-1.5%
- **Concentrated customer base**: +0.5-1%
- **Regulatory uncertainty**: +0.5-1.5%
- **Cross-shareholding unwinding risk**: +0.5% (if major cross-held shares being sold)

Subtract from base WACC:
- **Market leader with moat**: -0.5-1%
- **Recurring revenue model (SaaS, subscription)**: -0.5-1%
- **Investment grade credit rating (A- or above)**: -0.5%
- **Strong shareholder return policy (DOE commitment)**: -0.5%

## Reasonableness Checks

- WACC should typically be 2-4% below ROIC for value-creating companies
- If calculated WACC > ROIC, the company may be destroying value
- Japanese WACC of 4-8% is normal; if result exceeds 10%, double-check assumptions
- Compare to sector peers if available
- For PBR < 1.0x companies, consider whether low WACC justifies higher valuation (TSE reform catalyst)
