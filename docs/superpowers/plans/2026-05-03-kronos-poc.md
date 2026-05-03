# Kronos PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained Colab notebook that runs apples-to-apples walk-forward backtests of Kronos-small vs GBM on 7203/6758/9984, computes 3 evaluation metrics per stock, and prints a deterministic adopt/reject/hold verdict.

**Architecture:** Single Jupyter notebook (`notebooks/kronos_poc.ipynb`) executed on Google Colab. Notebook is the only deliverable. JQuants Premium API key is entered interactively via `getpass`, never committed. All heavy logic (Kronos inference, GBM, metrics, visualization) runs inside notebook cells. Atomic pickle write enables resume after Colab disconnects.

**Tech Stack:** Python 3.10+ on Colab, PyTorch ≥ 2.0 (Colab-installed), Hugging Face Hub (Kronos-small + Kronos-Tokenizer-base), NumPy, pandas, matplotlib, tqdm. No code runs locally; the user only opens the notebook in Colab.

**Spec reference:** `docs/superpowers/specs/2026-05-02-kronos-poc-design.md` (read this before starting).

---

## File Structure

| File | Purpose |
|------|---------|
| `notebooks/kronos_poc.ipynb` | Main deliverable — the Colab notebook |
| `notebooks/README.md` | Run instructions, API-key handling, clear-output reminder |
| `notebooks/.gitignore` | Ignore `*.pkl`, `*.checkpoint`, ipynb checkpoints |

The notebook is the **only runtime artifact**. No separate `.py` files; all helpers (`window_origins`, `compute_metrics`, atomic write) are defined inside notebook cells. This keeps the deliverable to a single file the user can upload to Colab.

**Editing notebook JSON**: notebooks are JSON. Use the `Write` tool to create/replace `kronos_poc.ipynb` in full each time, or use the helper pattern below to add cells incrementally:

```python
# Helper for the executor (do NOT commit this script):
import json, sys
nb_path = "notebooks/kronos_poc.ipynb"
with open(nb_path) as f: nb = json.load(f)
nb["cells"].append({
    "cell_type": "code",
    "metadata": {},
    "execution_count": None,
    "outputs": [],
    "source": ["..."]   # list of lines, each ending with \n except last
})
with open(nb_path, "w") as f: json.dump(nb, f, indent=1)
```

After each task, validate the notebook is well-formed:
```bash
python3 -c "import json; json.load(open('notebooks/kronos_poc.ipynb'))" && echo "JSON OK"
python3 -c "import ast,json; nb=json.load(open('notebooks/kronos_poc.ipynb')); [ast.parse(''.join(c['source'])) for c in nb['cells'] if c['cell_type']=='code']; print('AST OK')"
```

---

## Task 1: Notebook scaffold + README + .gitignore

**Files:**
- Create: `notebooks/kronos_poc.ipynb`
- Create: `notebooks/README.md`
- Create: `notebooks/.gitignore`

- [ ] **Step 1: Create `notebooks/.gitignore`**

```
*.pkl
*.pkl.tmp
.ipynb_checkpoints/
__pycache__/
```

- [ ] **Step 2: Create `notebooks/README.md`**

```markdown
# Kronos PoC Notebook

Single Colab notebook to evaluate Kronos-small vs GBM on Japanese stocks (7203/6758/9984). See `docs/superpowers/specs/2026-05-02-kronos-poc-design.md` for full design.

## How to run

1. Upload `kronos_poc.ipynb` to Google Colab (or open via `File > Open notebook > GitHub`)
2. (Optional) Switch to GPU: `Runtime > Change runtime type > T4 GPU`
3. `Runtime > Run all` and wait for the auth cell to prompt
4. Paste your JQuants Premium API key when asked (it stays in session memory only)
5. Total runtime: ~20-40 min on GPU (T4), ~3-6 hours on CPU. Cell 5 is the longest (per-sample loop, see plan Task 5).

## Resume after disconnect

If Colab disconnects mid-run, just `Runtime > Run all` again. Cells 5 and 6 read existing `*.pkl` and skip windows already done.

## Before saving / committing

If you intend to save the notebook back to git, **clear all outputs first** (`Edit > Clear all outputs`) so the API key bearer token (if accidentally printed) and stock prices do not leak into the repo.

## Files produced (Colab session only)

- `/content/kronos_results.pkl`, `/content/gbm_results.pkl` — intermediate results, regenerated on Run All

These are NOT in the repo. The notebook regenerates them.
```

- [ ] **Step 3: Create `notebooks/kronos_poc.ipynb` with title cell only**

Minimal valid notebook JSON:

```json
{
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# Kronos PoC: Kronos-small vs GBM on Japanese Stocks\n",
    "\n",
    "Spec: `docs/superpowers/specs/2026-05-02-kronos-poc-design.md`. Run all cells top to bottom. See `notebooks/README.md` for details."
   ]
  }
 ],
 "metadata": {
  "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
  "language_info": {"name": "python"}
 },
 "nbformat": 4,
 "nbformat_minor": 5
}
```

- [ ] **Step 4: Validate notebook JSON parses**

Run:
```bash
python3 -c "import json; nb=json.load(open('notebooks/kronos_poc.ipynb')); print(f'cells: {len(nb[\"cells\"])}')"
```
Expected: `cells: 1`

- [ ] **Step 5: Commit**

```bash
git add notebooks/
git commit -m "feat(kronos-poc): scaffold notebook, README, gitignore"
```

---

## Task 2: Cells 1 (setup) + 2 (auth)

**Files:**
- Modify: `notebooks/kronos_poc.ipynb` (append 2 markdown headers + 2 code cells)

- [ ] **Step 1: Add Cell 1 — setup (pip install + imports)**

Append a markdown header `## 1. Setup` then a code cell:

```python
# Cell 1: setup
!pip install -q einops==0.8.1 huggingface_hub==0.33.1 safetensors==0.6.2 tqdm==4.67.1
# torch / numpy / pandas / matplotlib are pre-installed on Colab; do not pin to avoid breaking Colab base env.

import os, json, time, hashlib, pickle, getpass
from datetime import datetime
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import requests
import torch
from tqdm.auto import tqdm

print(f"torch={torch.__version__}, cuda={torch.cuda.is_available()}, mps={torch.backends.mps.is_available()}")
```

- [ ] **Step 2: Add Cell 2 — auth (JQuants API key via getpass)**

Append markdown header `## 2. Auth` then code cell:

```python
# Cell 2: auth
# Try Colab Secrets first, fall back to interactive getpass. The key never gets printed.
try:
    from google.colab import userdata
    JQUANTS_API_KEY = userdata.get("JQUANTS_API_KEY")
    print("Loaded JQUANTS_API_KEY from Colab Secrets.")
except Exception:
    JQUANTS_API_KEY = None

if not JQUANTS_API_KEY:
    JQUANTS_API_KEY = getpass.getpass("JQuants API key (Premium plan): ").strip()

assert JQUANTS_API_KEY, "API key required"
os.environ["JQUANTS_API_KEY"] = JQUANTS_API_KEY
print(f"API key loaded ({len(JQUANTS_API_KEY)} chars). Header will be sent as 'x-api-key: ****'.")
```

- [ ] **Step 3: Validate the notebook JSON and Python AST**

Run:
```bash
python3 -c "import json,ast; nb=json.load(open('notebooks/kronos_poc.ipynb')); [ast.parse(''.join(c['source'])) for c in nb['cells'] if c['cell_type']=='code']; print(f'cells: {len(nb[\"cells\"])} (md+code)')"
```
Expected: `cells: 5` (1 title md + 2 section md + 2 code) and no AST errors.

- [ ] **Step 4: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add setup + auth cells"
```

---

## Task 3: Cell 3 — fetch_data (JQuants 4-year OHLCV)

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 row 3, §4.1 (uses `T_end - 1011 営業日` window).

- [ ] **Step 1: Add Cell 3 — fetch_data with backoff**

Append markdown header `## 3. Fetch OHLCV (~4 years)` then code cell:

```python
# Cell 3: fetch_data
STOCKS = {"7203": "Toyota", "6758": "Sony Group", "9984": "SoftBank Group"}
JQUANTS_BASE = "https://api.jquants.com/v2"
LOOKBACK = 256
HORIZON = 20
N_WINDOWS = 36
STRIDE = 21
SAMPLE_COUNT = 30
# Calendar-day budget for ~1011 business days (allow 50% headroom for weekends/holidays).
FETCH_DAYS_CAL = int((LOOKBACK + (N_WINDOWS - 1) * STRIDE + HORIZON) * 1.5) + 30

def fetch_ohlcv(code4: str) -> pd.DataFrame:
    """Fetch ~4 years of daily OHLCV from JQuants v2. Returns DataFrame indexed by Date with O/H/L/C/V columns."""
    code5 = code4 + "0"  # 4-digit -> 5-digit
    today = datetime.utcnow().date()
    start = (today - pd.Timedelta(days=FETCH_DAYS_CAL)).isoformat()
    end = today.isoformat()
    url = f"{JQUANTS_BASE}/equities/bars/daily"
    params = {"code": code5, "from": start, "to": end}
    headers = {"x-api-key": os.environ["JQUANTS_API_KEY"]}
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=30)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            data = r.json().get("data", [])
            if not data:
                raise RuntimeError(f"No data returned for {code4}")
            df = pd.DataFrame(data)
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date").sort_index()
            df = df.rename(columns={"AdjO": "open", "AdjH": "high", "AdjL": "low", "AdjC": "close", "AdjVo": "volume"})
            return df[["open", "high", "low", "close", "volume"]].astype(float)
        except requests.HTTPError as e:
            if e.response.status_code in (401, 403):
                raise RuntimeError("JQuants auth failed — check API key and Premium plan status") from e
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")

df_dict = {}
for code in STOCKS:
    df_dict[code] = fetch_ohlcv(code)
    print(f"{code} {STOCKS[code]}: rows={len(df_dict[code])}, range={df_dict[code].index.min().date()}..{df_dict[code].index.max().date()}")
    time.sleep(0.5)

# Sanity: enough rows for the full window plan
need = LOOKBACK + (N_WINDOWS - 1) * STRIDE + HORIZON
for code, df in df_dict.items():
    assert len(df) >= need, f"{code}: have {len(df)} rows, need >= {need}"
print(f"All stocks have enough rows (need >= {need}).")
```

- [ ] **Step 2: Validate notebook JSON and AST**

Run:
```bash
python3 -c "import json,ast; nb=json.load(open('notebooks/kronos_poc.ipynb')); [ast.parse(''.join(c['source'])) for c in nb['cells'] if c['cell_type']=='code']; print(f'cells: {len(nb[\"cells\"])}')"
```
Expected: `cells: 7` (1 title + 3 section md + 3 code).

- [ ] **Step 3: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add JQuants fetch cell with backoff and row-count sanity check"
```

---

## Task 4: Cells 4 (load_kronos) + 4.5 (smoke_test)

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 rows 4 + 4.5, §6.1.

- [ ] **Step 1: Add Cell 4 — clone Kronos and load model**

Append markdown header `## 4. Load Kronos` then code cell:

```python
# Cell 4: load_kronos
import sys, subprocess, pathlib

# Kronos repo is not on PyPI. Shallow-clone for the model wrapper code.
kronos_dir = pathlib.Path("/content/Kronos")
if not kronos_dir.exists():
    subprocess.check_call(["git", "clone", "--depth", "1", "https://github.com/shiyu-coder/Kronos.git", str(kronos_dir)])
if str(kronos_dir) not in sys.path:
    sys.path.insert(0, str(kronos_dir))

from model import Kronos, KronosTokenizer, KronosPredictor  # noqa: E402

# Device priority: CUDA (Colab T4) > MPS (unlikely on Colab) > CPU
if torch.cuda.is_available():
    device = "cuda:0"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

tokenizer = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base")
model = Kronos.from_pretrained("NeoQuasar/Kronos-small")
predictor = KronosPredictor(model, tokenizer, device=device, max_context=512)
print(f"Kronos-small loaded on {device}.")
```

- [ ] **Step 2: Add Cell 4.5 — smoke_test (1 window × 2 samples)**

Append markdown header `## 4.5. Smoke test` then code cell:

```python
# Cell 4.5: smoke_test
test_code = "7203"
test_df = df_dict[test_code].iloc[-(LOOKBACK + HORIZON + 4):-(HORIZON + 4)]  # any window with both lookback & horizon
test_horizon_ts = pd.Series(df_dict[test_code].iloc[-(HORIZON + 4):-4].index)
test_x_ts = pd.Series(test_df.index)
assert len(test_df) == LOOKBACK and len(test_horizon_ts) == HORIZON

x_df = test_df.copy()
x_df["amount"] = 0.0  # Kronos optional column
pred = predictor.predict(
    df=x_df[["open", "high", "low", "close", "volume", "amount"]],
    x_timestamp=test_x_ts,
    y_timestamp=test_horizon_ts,
    pred_len=HORIZON,
    T=1.0,
    top_p=0.9,
    sample_count=2,
    verbose=False,
)
assert pred.shape[0] == HORIZON, f"expected {HORIZON} rows, got {pred.shape}"
assert not pred["close"].isna().any(), "NaN in close"
assert (pred["close"] > 0).all(), "non-positive close"
print(f"Smoke OK: pred shape={pred.shape}, close range=[{pred['close'].min():.0f}, {pred['close'].max():.0f}]")
```

- [ ] **Step 3: Validate notebook JSON and AST**

Run:
```bash
python3 -c "import json,ast; nb=json.load(open('notebooks/kronos_poc.ipynb')); [ast.parse(''.join(c['source'])) for c in nb['cells'] if c['cell_type']=='code']; print(f'cells: {len(nb[\"cells\"])}')"
```
Expected: `cells: 11`.

- [ ] **Step 4: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add Kronos load + smoke test cells"
```

---

## Task 5: Window helper + Cell 5 walkforward_kronos

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 row 5, §4.1, §4.2, §5.2 (atomic pickle).

- [ ] **Step 1: Add helper cell — `window_origins` + atomic pickle**

Append markdown header `## 5. Walk-forward (Kronos)` then code cell with helpers:

```python
# Cell 5a: helpers (window generation + atomic pickle)
def window_origins(df: pd.DataFrame) -> list:
    """Return 36 window origins per spec §4.1.

    For each i in 0..35: origin_i index = T_end_idx - HORIZON - (35-i)*STRIDE
    Returns list of (origin_idx, lookback_dates, horizon_dates, S0, actual).
    """
    T_end_idx = len(df) - 1
    out = []
    for i in range(N_WINDOWS):
        origin_idx = T_end_idx - HORIZON - (N_WINDOWS - 1 - i) * STRIDE
        lo_lo = origin_idx - (LOOKBACK - 1)  # inclusive 256-bar window ending at origin_idx
        if lo_lo < 0 or origin_idx + HORIZON > T_end_idx:
            raise RuntimeError(f"window {i} out of range: lo_lo={lo_lo}, origin={origin_idx}, T_end={T_end_idx}")
        lookback_slice = df.iloc[lo_lo: origin_idx + 1]      # 256 rows including origin_idx
        horizon_slice = df.iloc[origin_idx + 1: origin_idx + 1 + HORIZON]
        assert len(lookback_slice) == LOOKBACK
        assert len(horizon_slice) == HORIZON
        out.append({
            "origin": lookback_slice.index[-1],
            "lookback": lookback_slice,
            "horizon_dates": list(horizon_slice.index),
            "actual": horizon_slice["close"].to_numpy(dtype=np.float64),
            "S0": float(lookback_slice["close"].iloc[-1]),
        })
    return out

def atomic_pickle_dump(obj, path: str):
    """Write pickle atomically: write to .tmp, fsync, rename. See spec §5.2."""
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        pickle.dump(obj, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

# self-check on first stock
_check = window_origins(df_dict["7203"])
assert len(_check) == N_WINDOWS
assert _check[-1]["horizon_dates"][-1] == df_dict["7203"].index[-1], "last window must end at T_end"
print(f"window_origins OK: 36 windows, last horizon ends at {_check[-1]['horizon_dates'][-1].date()}")
```

- [ ] **Step 2: Add Cell 5 — walkforward_kronos with resume**

Append code cell (no new markdown header):

```python
# Cell 5: walkforward_kronos
KRONOS_RESULTS_PATH = "/content/kronos_results.pkl"

if os.path.exists(KRONOS_RESULTS_PATH):
    with open(KRONOS_RESULTS_PATH, "rb") as f:
        kronos_results = pickle.load(f)
    print(f"Resumed: {len(kronos_results)} windows already done")
else:
    kronos_results = []
done_keys = {(r["code"], r["lookback_end"]) for r in kronos_results}

todo = []
for code, df in df_dict.items():
    for w in window_origins(df):
        if (code, w["origin"]) in done_keys:
            continue
        todo.append((code, w))

for code, w in tqdm(todo, desc="Kronos walk-forward"):
    x_df = w["lookback"].copy()
    x_df["amount"] = 0.0
    x_ts = pd.Series(w["lookback"].index)
    y_ts = pd.Series(w["horizon_dates"])
    # IMPORTANT: KronosPredictor.predict() with sample_count>1 averages internally
    # (kronos.py:467 `preds = np.mean(preds, axis=1)`), returning a single averaged DataFrame.
    # For percentile metrics we need raw samples, so call predict() sample_count times
    # with sample_count=1 each. This is ~30x more Python overhead per window than a
    # batched no-mean variant would be, but it's the simplest way without forking Kronos.
    paths = np.zeros((SAMPLE_COUNT, HORIZON), dtype=np.float64)
    for s in range(SAMPLE_COUNT):
        single = predictor.predict(
            df=x_df[["open", "high", "low", "close", "volume", "amount"]],
            x_timestamp=x_ts, y_timestamp=y_ts, pred_len=HORIZON,
            T=1.0, top_p=0.9, sample_count=1, verbose=False,
        )
        paths[s, :] = single["close"].to_numpy(dtype=np.float64)
    kronos_results.append({
        "code": code,
        "lookback_end": w["origin"],
        "horizon_dates": w["horizon_dates"],
        "actual": w["actual"],
        "predicted_paths": paths,
        "S0": w["S0"],
    })
    atomic_pickle_dump(kronos_results, KRONOS_RESULTS_PATH)

print(f"Kronos walk-forward complete: {len(kronos_results)} windows total")
```

**Note for executor:** Verified against Kronos source (`model/kronos.py:467`): `auto_regressive_inference` averages over the sample axis before returning, and `KronosPredictor.predict()` exposes no `return_samples` flag. The per-sample loop is therefore required, not a workaround for an unknown API. Adjusted runtime estimate: roughly **2× slower** than the spec's GPU figure (so ~20-40 min on T4 GPU, ~3-6 hours on CPU). If Kronos releases a raw-sample API in the future, switch to a single batched call.

- [ ] **Step 3: Validate notebook JSON and AST**

Expected: `cells: 13`.

- [ ] **Step 4: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add window helper, atomic pickle, Kronos walk-forward with resume"
```

---

## Task 6: Cell 6 walkforward_gbm + Cell 6.5 gbm_sanity

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 rows 6 + 6.5, §4.3 (ddof=1, SHA-256 seed), §6.2.

- [ ] **Step 1: Add Cell 6 — walkforward_gbm**

Append markdown header `## 6. Walk-forward (GBM baseline)` then code cell:

```python
# Cell 6: walkforward_gbm
GBM_RESULTS_PATH = "/content/gbm_results.pkl"

def gbm_seed(code: str, lookback_end: pd.Timestamp) -> int:
    """Stable seed (independent of PYTHONHASHSEED) per (code, origin). Spec §4.3."""
    payload = f"{code}|{lookback_end.isoformat()}".encode()
    return int.from_bytes(hashlib.sha256(payload).digest()[:4], "big")

def simulate_gbm(lookback_close: np.ndarray, S0: float, code: str, origin: pd.Timestamp) -> np.ndarray:
    """Returns shape (SAMPLE_COUNT, HORIZON) of simulated close paths. Spec §4.3."""
    log_r = np.diff(np.log(lookback_close))  # 255 returns from 256 closes
    mu = float(np.mean(log_r))
    sigma = float(np.std(log_r, ddof=1))
    rng = np.random.default_rng(gbm_seed(code, origin))
    Z = rng.standard_normal(size=(SAMPLE_COUNT, HORIZON))
    drift = mu - 0.5 * sigma * sigma
    paths = np.zeros((SAMPLE_COUNT, HORIZON), dtype=np.float64)
    prev = np.full(SAMPLE_COUNT, S0, dtype=np.float64)
    for j in range(HORIZON):
        prev = prev * np.exp(drift + sigma * Z[:, j])
        paths[:, j] = prev
    return paths

if os.path.exists(GBM_RESULTS_PATH):
    with open(GBM_RESULTS_PATH, "rb") as f:
        gbm_results = pickle.load(f)
    print(f"Resumed GBM: {len(gbm_results)} windows already done")
else:
    gbm_results = []
gbm_done = {(r["code"], r["lookback_end"]) for r in gbm_results}

for code, df in df_dict.items():
    for w in window_origins(df):
        if (code, w["origin"]) in gbm_done:
            continue
        paths = simulate_gbm(
            lookback_close=w["lookback"]["close"].to_numpy(dtype=np.float64),
            S0=w["S0"],
            code=code,
            origin=w["origin"],
        )
        gbm_results.append({
            "code": code,
            "lookback_end": w["origin"],
            "horizon_dates": w["horizon_dates"],
            "actual": w["actual"],
            "predicted_paths": paths,
            "S0": w["S0"],
        })
        atomic_pickle_dump(gbm_results, GBM_RESULTS_PATH)

print(f"GBM walk-forward complete: {len(gbm_results)} windows total")
```

- [ ] **Step 2: Add Cell 6.5 — gbm_sanity**

Append markdown header `## 6.5. GBM theoretical-mean check` then code cell:

```python
# Cell 6.5: gbm_sanity (only check the first window for cost reasons)
sample = gbm_results[0]
lb_close = df_dict[sample["code"]].loc[:sample["lookback_end"], "close"].to_numpy(dtype=np.float64)[-LOOKBACK:]
log_r = np.diff(np.log(lb_close))
mu_check = float(np.mean(log_r))
expected_mean = sample["S0"] * np.exp(mu_check * HORIZON)
empirical_mean = float(sample["predicted_paths"][:, -1].mean())
relative_err = abs(empirical_mean - expected_mean) / expected_mean
assert relative_err < 0.10, f"GBM theoretical-mean deviation {relative_err:.1%} > 10%"
print(f"GBM sanity OK: theoretical={expected_mean:.0f}, empirical={empirical_mean:.0f}, rel_err={relative_err:.1%}")
```

- [ ] **Step 3: Validate notebook JSON and AST**

Expected: `cells: 17`.

- [ ] **Step 4: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add GBM walk-forward + theoretical-mean sanity check"
```

---

## Task 7: compute_metrics + Cell 7 metrics + Cell 7.5 metrics_sanity

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 rows 7 + 7.5, §4.4, §5.4 (integrity asserts), §6.3.

- [ ] **Step 1: Add Cell 7a — `compute_metrics` function + integrity asserts**

Append markdown header `## 7. Metrics` then code cell:

```python
# Cell 7a: compute_metrics + integrity check
def compute_metrics(results: list) -> dict:
    """Per-stock metrics dict {code: {'directional_acc', 'mape_pct', 'pi80_coverage'}}."""
    by_code = {}
    for r in results:
        by_code.setdefault(r["code"], []).append(r)
    out = {}
    for code, ws in by_code.items():
        n = len(ws)
        terminal_pred = np.array([np.median(w["predicted_paths"][:, -1]) for w in ws])
        terminal_actual = np.array([w["actual"][-1] for w in ws])
        S0 = np.array([w["S0"] for w in ws])
        pred_dir = np.sign(terminal_pred - S0)
        act_dir  = np.sign(terminal_actual - S0)
        directional_acc = float(np.mean(pred_dir == act_dir))
        mape_pct = float(np.mean(np.abs(terminal_pred - terminal_actual) / terminal_actual * 100.0))
        p10 = np.array([np.percentile(w["predicted_paths"][:, -1], 10) for w in ws])
        p90 = np.array([np.percentile(w["predicted_paths"][:, -1], 90) for w in ws])
        pi80_coverage = float(np.mean((p10 <= terminal_actual) & (terminal_actual <= p90)))
        out[code] = {
            "directional_acc": directional_acc,
            "mape_pct": mape_pct,
            "pi80_coverage": pi80_coverage,
            "n_windows": n,
        }
    return out

# Integrity asserts (spec §5.4)
assert len(kronos_results) == len(gbm_results), f"length mismatch: {len(kronos_results)} vs {len(gbm_results)}"
ksort = sorted(kronos_results, key=lambda r: (r["code"], r["lookback_end"]))
gsort = sorted(gbm_results,    key=lambda r: (r["code"], r["lookback_end"]))
for k, g in zip(ksort, gsort):
    assert k["code"] == g["code"], f"code mismatch: {k['code']} vs {g['code']}"
    assert k["lookback_end"] == g["lookback_end"], f"origin mismatch: {k['lookback_end']} vs {g['lookback_end']}"
    assert np.array_equal(k["actual"], g["actual"]), "actual mismatch"
    assert k["predicted_paths"].shape == g["predicted_paths"].shape, "shape mismatch"
print("Integrity OK: paired structure consistent across Kronos and GBM.")
```

- [ ] **Step 2: Add Cell 7b — compute and display metrics table**

Append code cell:

```python
# Cell 7b: compute and display
m_kronos = compute_metrics(kronos_results)
m_gbm    = compute_metrics(gbm_results)

rows = []
for code in STOCKS:
    rows.append([code, "Kronos", m_kronos[code]["directional_acc"], m_kronos[code]["mape_pct"], m_kronos[code]["pi80_coverage"]])
    rows.append([code, "GBM",    m_gbm[code]["directional_acc"],    m_gbm[code]["mape_pct"],    m_gbm[code]["pi80_coverage"]])
metrics_df = pd.DataFrame(rows, columns=["code", "model", "directional_acc", "mape_pct", "pi80_coverage"])
print(metrics_df.to_string(index=False, float_format=lambda x: f"{x:.3f}"))
```

- [ ] **Step 3: Add Cell 7.5 — metrics_sanity**

Append markdown header `## 7.5. Metrics self-check` then code cell:

```python
# Cell 7.5: metrics_sanity (synthetic perfect / opposite predictions)
fake_actual = np.full(HORIZON, 110.0)
fake_perfect = np.tile(fake_actual, (SAMPLE_COUNT, 1))
fake_results_perfect = [{"code": "X", "lookback_end": pd.Timestamp("2026-01-01"),
                         "horizon_dates": [], "actual": fake_actual,
                         "predicted_paths": fake_perfect, "S0": 100.0}]
m_perfect = compute_metrics(fake_results_perfect)["X"]
assert m_perfect["directional_acc"] == 1.0, m_perfect
assert m_perfect["mape_pct"] == 0.0, m_perfect
assert m_perfect["pi80_coverage"] == 1.0, m_perfect

fake_opposite = np.tile(np.full(HORIZON, 90.0), (SAMPLE_COUNT, 1))  # predicted DOWN, actual UP
fake_results_opposite = [{"code": "Y", "lookback_end": pd.Timestamp("2026-01-01"),
                          "horizon_dates": [], "actual": fake_actual,
                          "predicted_paths": fake_opposite, "S0": 100.0}]
m_opposite = compute_metrics(fake_results_opposite)["Y"]
assert m_opposite["directional_acc"] == 0.0, m_opposite
assert m_opposite["pi80_coverage"] == 0.0, m_opposite
print("Metrics sanity OK.")
```

- [ ] **Step 4: Validate notebook JSON and AST**

Expected: `cells: 22`.

- [ ] **Step 5: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add compute_metrics, integrity asserts, metrics sanity"
```

---

## Task 8: Cell 8 visualize

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §3.1 row 8, §6.4.

- [ ] **Step 1: Add Cell 8 — visualize one representative window per stock**

Append markdown header `## 8. Visualization` then code cell:

```python
# Cell 8: visualize one representative window per stock
def find_window(results: list, code: str, lookback_end: pd.Timestamp) -> dict:
    for r in results:
        if r["code"] == code and r["lookback_end"] == lookback_end:
            return r
    raise KeyError(f"window not found: {code} {lookback_end}")

# Pick the most recent window per stock (i=35) to plot
fig, axes = plt.subplots(len(STOCKS), 1, figsize=(11, 3.2 * len(STOCKS)), sharex=False)
if len(STOCKS) == 1:
    axes = [axes]

for ax, code in zip(axes, STOCKS):
    most_recent = max((r["lookback_end"] for r in kronos_results if r["code"] == code))
    k = find_window(kronos_results, code, most_recent)
    g = find_window(gbm_results,    code, most_recent)
    dates = k["horizon_dates"]
    actual = k["actual"]
    k_med = np.median(k["predicted_paths"], axis=0)
    k_p10 = np.percentile(k["predicted_paths"], 10, axis=0)
    k_p90 = np.percentile(k["predicted_paths"], 90, axis=0)
    g_med = np.median(g["predicted_paths"], axis=0)
    g_p10 = np.percentile(g["predicted_paths"], 10, axis=0)
    g_p90 = np.percentile(g["predicted_paths"], 90, axis=0)
    ax.plot(dates, actual, "k-", lw=2, label="actual")
    ax.plot(dates, k_med, "b-", lw=1.5, label="Kronos median")
    ax.fill_between(dates, k_p10, k_p90, alpha=0.18, color="blue", label="Kronos 80% PI")
    ax.plot(dates, g_med, "r--", lw=1.5, label="GBM median")
    ax.fill_between(dates, g_p10, g_p90, alpha=0.18, color="red", label="GBM 80% PI")
    ax.set_title(f"{code} {STOCKS[code]} — window ending {most_recent.date()}")
    ax.set_ylabel("close")
    ax.legend(loc="best", fontsize=9)
    ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()
```

- [ ] **Step 2: Validate notebook JSON and AST**

Expected: `cells: 24`.

- [ ] **Step 3: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add representative-window visualization"
```

---

## Task 9: Cell 9 verdict

**Files:**
- Modify: `notebooks/kronos_poc.ipynb`

Spec ref: §1.2 (decision tree), §3.1 row 9.

- [ ] **Step 1: Add Cell 9 — verdict per spec §1.2 decision tree**

Append markdown header `## 9. Verdict` then code cell:

```python
# Cell 9: verdict (spec §1.2)
DIR_THRESHOLD = 0.05  # 5pt directional-accuracy edge

def classify(code: str) -> str:
    k = m_kronos[code]; g = m_gbm[code]
    win = (k["directional_acc"] >= g["directional_acc"] + DIR_THRESHOLD) and (k["mape_pct"] <= g["mape_pct"])
    loss = (k["directional_acc"] <  g["directional_acc"]) and (k["mape_pct"] >  g["mape_pct"])
    if win:  return "Kronos-win"
    if loss: return "Kronos-loss"
    return "mixed"

classes = {code: classify(code) for code in STOCKS}
n_win  = sum(1 for v in classes.values() if v == "Kronos-win")
n_loss = sum(1 for v in classes.values() if v == "Kronos-loss")
n_total = len(STOCKS)

if n_win >= 2:
    verdict = "ADOPT"
elif n_loss == n_total:
    verdict = "REJECT"
else:
    verdict = "HOLD"

print(f"Per-stock classification: {classes}")
print(f"Counts: win={n_win}, loss={n_loss}, total={n_total}")
print(f"\n{'='*40}\nVERDICT: {verdict}\n{'='*40}\n")
print(metrics_df.to_string(index=False, float_format=lambda x: f"{x:.3f}"))
print("\nNotes:")
print("- ADOPT: ≥2 stocks fully won by Kronos (directional +5pt AND MAPE ≤)")
print("- REJECT: all 3 stocks fully lost by Kronos (directional < AND MAPE >)")
print("- HOLD: mixed; may consider fine-tuning or extending evaluation")
```

- [ ] **Step 2: Validate notebook JSON and AST**

Expected: `cells: 26`.

- [ ] **Step 3: Commit**

```bash
git add notebooks/kronos_poc.ipynb
git commit -m "feat(kronos-poc): add verdict cell implementing spec §1.2 decision tree"
```

---

## Task 10: End-to-end notebook validation

**Files:**
- Read-only check on `notebooks/kronos_poc.ipynb`

- [ ] **Step 1: Validate JSON, AST, and structural integrity**

Run:
```bash
python3 - <<'EOF'
import json, ast
with open("notebooks/kronos_poc.ipynb") as f:
    nb = json.load(f)
assert nb["nbformat"] == 4
code_cells = [c for c in nb["cells"] if c["cell_type"] == "code"]
md_cells   = [c for c in nb["cells"] if c["cell_type"] == "markdown"]
print(f"total cells: {len(nb['cells'])}, code: {len(code_cells)}, md: {len(md_cells)}")
for i, c in enumerate(code_cells):
    src = "".join(c["source"])
    try:
        ast.parse(src)
    except SyntaxError as e:
        raise SystemExit(f"Cell {i} has SyntaxError: {e}")
print("All code cells parse cleanly.")
EOF
```

Expected: `total cells: 26, code: 12, md: 14` (or close — may vary if md headers were combined) and `All code cells parse cleanly.`

- [ ] **Step 2: Confirm no API key, no PII, no /content/ paths in committed file**

Run:
```bash
grep -nE "(JQUANTS|Bearer|api[_-]?key|sulgraphica)" notebooks/kronos_poc.ipynb | grep -vE "(JQUANTS_API_KEY|x-api-key|Premium plan|userdata.get)" || echo "no leaks"
```
Expected: `no leaks` (or only the legitimate references to the env var name).

- [ ] **Step 3: Confirm `notebooks/.gitignore` covers `*.pkl`**

Run:
```bash
grep -E "\\*\\.pkl" notebooks/.gitignore
```
Expected: matches `*.pkl` and `*.pkl.tmp`.

- [ ] **Step 4: Final commit if any cleanup occurred**

If steps 1-3 made changes, commit them. Otherwise, skip:

```bash
git status
git add -u
git commit -m "chore(kronos-poc): final validation pass" || echo "nothing to commit"
```

- [ ] **Step 5: Print handoff message**

Print:
```
PoC notebook ready at notebooks/kronos_poc.ipynb.
Next steps for the user:
  1. Open the file in Google Colab (File > Open notebook > GitHub or drag-and-drop)
  2. (Optional) Switch to GPU: Runtime > Change runtime type > T4 GPU
  3. Runtime > Run all
  4. Paste the JQuants Premium API key when prompted
  5. After ~10-20 min (GPU) or ~3 hours (CPU), the verdict cell prints ADOPT / REJECT / HOLD.
  6. Before saving back to git, Edit > Clear all outputs to avoid leaking API key or stock data.
```

---

## Acceptance Criteria

- [ ] `notebooks/kronos_poc.ipynb` exists and is valid JSON / valid Python in every code cell
- [ ] All 11 cells from spec §3.1 are present (Cells 1, 2, 3, 4, 4.5, 5, 6, 6.5, 7, 7.5, 8, 9 — note: Task 5 splits Cell 5 into a helpers cell + main cell, and Task 7 splits Cell 7 into 7a + 7b)
- [ ] No API key, bearer token, or `sulgraphica` email appears anywhere in the committed file
- [ ] `notebooks/README.md` documents how to run, how to resume, and how to clear outputs before commit
- [ ] `notebooks/.gitignore` excludes `*.pkl` and `*.pkl.tmp`
- [ ] Spec sections that the implementation must match: §1.2 (verdict tree), §3.2 (Window dtype), §4.1 (window math with `-HORIZON` offset), §4.3 (ddof=1, SHA-256 seed), §4.4 (metrics formulas, terminal-only), §5.2 (atomic pickle), §5.4 (sorted + np.array_equal), §6.1-6.3 (sanity tests)
- [ ] Plan does NOT execute the notebook against the real JQuants API or HuggingFace from the developer's machine — runtime verification happens in Colab

---

## What this plan deliberately does NOT do (YAGNI)

- No pytest test suite (spec §6.5 explicitly excludes this; sanity asserts inside the notebook are sufficient)
- No mock JQuants client for offline dev — runtime checks happen in Colab
- No CI integration — notebook is a one-time PoC artifact
- No fine-tuning code — spec §1.3 excludes this from PoC scope
- No production wiring into kabu-dexter skills — happens only after ADOPT verdict, in a separate spec
