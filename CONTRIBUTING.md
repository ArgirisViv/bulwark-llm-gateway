# Contributing to Bulwark

Thanks for your interest. Bug reports, detector improvements and documentation fixes are welcome.

## Setup

Requires Python 3.12, [uv](https://docs.astral.sh/uv/) and, for the dashboard, Node 22.

```bash
make install
make check          # ruff, format check, mypy (strict), pytest with an 85% coverage gate
```

Dashboard: `cd dashboard && npm ci && npx tsc -b`.

## Workflow

1. Open an issue for anything non-trivial so the approach can be agreed first.
2. Branch from `main`, keep changes focused, and add tests with the change.
3. Run `make check` and, if you touched detectors or policy, the evaluation harness:
   `cd gateway && uv run python ../eval/harness.py --output ../eval/reports`.
4. Open a pull request. CI must be green.

## Detector changes

Detectors only report findings; they never decide actions (that is the policy engine's job). New detections should come with positive and negative cases in `eval/corpus/corpus.jsonl` so the recall and false-positive numbers stay honest.

## Security issues

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).
