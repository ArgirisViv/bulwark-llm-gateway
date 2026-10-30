# Evaluation

Labelled corpus (attacks, benign traffic, data-leak cases) and the harness that
produces the per-release evaluation report.

- `corpus/corpus.jsonl`: one JSON sample per line (`id`, `label`, `direction`,
  `text`, optional `canary_token` and `note`). Labels: `injection`, `pii`,
  `secret`, `canary`, `benign`.
- `harness.py`: runs the corpus through the production detectors and policy.
- `REPORT.md`: report for the current release. `reports/` is generated output.

Run from `gateway/`:

```bash
uv run python ../eval/harness.py --output ../eval/reports
```

Add a sample whenever a bypass or false positive is found; the test suite
(`gateway/tests/test_eval.py`) fails if recall drops or a benign sample is flagged.
