# Bulwark evaluation report (v1.0.0)

Generated 2026-10-27 16:00 UTC · policy `default.yaml` · 61 samples (40 attack, 21 benign).

## Overall

- Recall: **95.0%**
- Precision: **100.0%**
- False-positive rate on benign traffic: **0.0%**
- Latency per sample (ms): p50 0.167, p95 0.494, max 3.04

## Per category

| Category | Samples | Detected | Enforced (block/redact) | Recall | Missed |
|---|---:|---:|---:|---:|---|
| canary | 5 | 5 | 5 | 100.0% | - |
| injection | 17 | 15 | 15 | 88.2% | inj-016, inj-017 |
| pii | 11 | 11 | 11 | 100.0% | - |
| secret | 7 | 7 | 7 | 100.0% | - |

## False positives

None.

## Known limitations observed

- `inj-016`: non-English; heuristic is English only (known limitation)
- `inj-017`: paraphrase without trigger words (known limitation)

The corpus is small and hand-written; these figures are a regression baseline, not a guarantee of real-world detection rates.
