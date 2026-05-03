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

**Caveat (cross-day resume):** Window origins are anchored to "latest trading day − 20 − i × 21 trading days" relative to the current latest row in the fetched data. If you resume on a later trading day, Cell 3 will fetch one more bar, every origin shifts forward by one day, and **none of the cached pickle entries match** — the notebook will silently re-compute all 108 Kronos + 108 GBM windows. To finish a multi-session run cleanly, complete it within the same trading day, or delete `/content/kronos_results.pkl` and `/content/gbm_results.pkl` before re-running across a market close.

## Before saving / committing

If you intend to save the notebook back to git, **clear all outputs first** (`Edit > Clear all outputs`) so the API key bearer token (if accidentally printed) and stock prices do not leak into the repo.

## Files produced (Colab session only)

- `/content/kronos_results.pkl`, `/content/gbm_results.pkl` — intermediate results, regenerated on Run All

These are NOT in the repo. The notebook regenerates them.
